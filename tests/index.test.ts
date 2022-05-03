import { add, multi } from '../src';

let [a, b] = [Math.random(), Math.random()];
it('add', () => {
  expect(add(a, b)).toEqual(a + b);
});

it('mulit', () => {
  expect(multi(a, b)).toBe(a * b);
});
