import {norm} from './model';
import {outputs} from './material-state';
const active = (m: any) => outputs(m).length>0 && !!String(m.item_code || '').trim();
export function validateStandardAdditions(previous: any[], next: any[]) {
  const oldNumbers = new Set(previous.filter(m => norm(m.destination) === 'STANDARD' && active(m)).map(m => +m.list_no));
  const added = next.filter(m => norm(m.destination) === 'STANDARD' && active(m) && !oldNumbers.has(+m.list_no));
  const conflicts = added.flatMap(s => next.filter(m => norm(m.destination) !== 'STANDARD'
    && +m.list_no === +s.list_no && active(m)
    && previous.some(old => old.id === m.id && active(old)))
    .map(m => `${m.destination} · No.${m.list_no} (${m.item_code})`));
  if (conflicts.length) throw Error('Không thể thêm Standard: trùng No. với Extra / Standard conflicts with Extra: ' + conflicts.join(', '));
}
