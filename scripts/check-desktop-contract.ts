import { request } from '../src/lib/bridge';

function checkTypes() {
  const file = request('file.get', { cwd: 'D:/项目', path: '说明.txt' });
  const text: Promise<string> = file.then(value => value.content);
  // @ts-expect-error 命令拼写错误必须被拒绝。
  void request('flie.get', { cwd: 'D:/项目', path: '说明.txt' });
  // @ts-expect-error 参数类型错误必须被拒绝。
  void request('file.get', { cwd: 123, path: '说明.txt' });
  // @ts-expect-error 保存文件必须携带读取时的版本。
  void request('file.save', { cwd: 'D:/项目', path: '说明.txt', content: '修改' });
  // @ts-expect-error 命令不接受任意附加参数。
  void request('file.get', { cwd: 'D:/项目', path: '说明.txt', other: true });
  // @ts-expect-error 返回结果不能由调用者替换为任意类型。
  const incorrect: Promise<number> = request('file.get', { cwd: 'D:/项目', path: '说明.txt' });
  return [text, incorrect];
}

void checkTypes;
console.log('宿主命令类型断言已纳入类型检查');
