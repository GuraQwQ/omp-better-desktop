use serde_json::{Value, json};
use std::{
    io,
    path::Path,
    process::{Command, Output},
};

fn git(cwd: &Path, args: &[&str]) -> io::Result<Output> {
    crate::platform::hidden(
        Command::new("git")
            .args(args)
            .env("LC_ALL", "C")
            .current_dir(cwd),
    )
    .output()
}

fn error(output: &Output) -> String {
    let message = String::from_utf8_lossy(&output.stderr).trim().to_owned();
    if message.contains("not a git repository") {
        "This project is not a Git working tree.".into()
    } else if message.is_empty() {
        format!("Git exited with {}.", output.status)
    } else {
        message
    }
}

pub fn files(cwd: &Path) -> Result<Value, String> {
    let cwd = cwd.canonicalize().map_err(|e| e.to_string())?;
    match git(
        &cwd,
        &[
            "ls-files",
            "-z",
            "--cached",
            "--others",
            "--exclude-standard",
            "--",
            ".",
        ],
    ) {
        Ok(output) if output.status.success() && !output.stdout.is_empty() => {
            let mut paths: Vec<_> = String::from_utf8_lossy(&output.stdout)
                .split('\0')
                .filter(|path| !path.is_empty())
                .map(str::to_owned)
                .collect();
            paths.sort();
            paths.dedup();
            return Ok(json!(paths));
        }
        Ok(output) if !output.status.success() => {
            if !String::from_utf8_lossy(&output.stderr).contains("not a git repository") {
                return Err(error(&output));
            }
        }
        Err(e) if e.kind() != io::ErrorKind::NotFound => return Err(e.to_string()),
        _ => {}
    }
    let mut paths = Vec::new();
    for entry in ignore::WalkBuilder::new(&cwd)
        .require_git(false)
        .parents(false)
        .hidden(false)
        .filter_entry(|entry| entry.file_name() != ".git")
        .build()
    {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().is_some_and(|kind| kind.is_file()) {
            paths.push(
                entry
                    .path()
                    .strip_prefix(&cwd)
                    .map_err(|e| e.to_string())?
                    .to_string_lossy()
                    .replace('\\', "/"),
            );
        }
    }
    paths.sort();
    Ok(json!(paths))
}

pub fn diff(cwd: &Path) -> Result<Value, String> {
    let cwd = cwd.canonicalize().map_err(|e| e.to_string())?;
    let run = |args: &[&str]| -> Result<Output, String> {
        git(&cwd, args).map_err(|e| {
            if e.kind() == io::ErrorKind::NotFound {
                "Git is required to review project changes.".into()
            } else {
                e.to_string()
            }
        })
    };
    let status = run(&["status", "--short", "--", "."])?;
    if !status.status.success() {
        return Err(error(&status));
    }
    let head = run(&["rev-parse", "--verify", "--quiet", "HEAD"])?;
    let mut args = vec!["diff", "--no-ext-diff", "--no-color"];
    if head.status.success() {
        args.push("HEAD");
    } else if head.status.code() == Some(1) && head.stderr.is_empty() {
        args.push("--cached");
    } else {
        return Err(error(&head));
    }
    args.extend(["--", "."]);
    let changes = run(&args)?;
    if !changes.status.success() {
        return Err(error(&changes));
    }
    let mut diff = String::from_utf8_lossy(&changes.stdout).into_owned();
    if !head.status.success() {
        let unstaged = run(&["diff", "--no-ext-diff", "--no-color", "--", "."])?;
        if !unstaged.status.success() {
            return Err(error(&unstaged));
        }
        diff.push_str(&String::from_utf8_lossy(&unstaged.stdout));
    }
    Ok(json!({"diff":diff,"status":String::from_utf8_lossy(&status.stdout)}))
}
