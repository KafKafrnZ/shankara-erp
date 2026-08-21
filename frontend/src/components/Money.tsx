import { formatINR } from '../lib/format.ts';

export function Money({ value }: { value: string }) {
  return <span className="money">{formatINR(value)}</span>;
}
