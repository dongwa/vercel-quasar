import { getQuasarConfig } from '../src/utils';

it('getQuasarConfig', () => {
  const testPro = '/Users/lin/Code/repo/quasar-docs-cn';
  // const testPro = '/Users/lin/Code/test/qua/quasar-vite';
  const res = getQuasarConfig(testPro);

  console.log('res', res);
  expect(res).not.toBeNull();
});
