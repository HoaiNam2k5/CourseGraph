import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { foldSearchText } from '../../../../packages/shared/src/search.js';
import { formatNumber, nodeName, type BusinessNode } from '../types.js';
import { ErrorNotice, Modal } from './common.js';
import { useMobileGraph } from './GraphDetailSheet.js';
import SearchField from './SearchField.js';

const noStudent = 'Không áp dụng sinh viên';

type StudentFilterProps = {
  students: BusinessNode[];
  loading: boolean;
  error: string;
  retry: () => void;
  value: string;
  onApply: (student: string) => void;
};

export default function GraphStudentFilter({ students, loading, error, retry, value, onApply }: StudentFilterProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const selectionId = useId();
  const student = students.find((item) => item.id === value);
  const selection = student ? `${student.id} · ${nodeName(student)}` : value || noStudent;

  function close() {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  }

  return <>
    <div className="field graph-student-filter">
      <span>Trạng thái theo sinh viên</span>
      <button ref={trigger} type="button" className="button secondary graph-student-trigger"
        aria-haspopup="dialog" aria-label="Trạng thái theo sinh viên" aria-expanded={open}
        aria-describedby={selectionId} title={selection} onClick={() => setOpen(true)}>
        <span id={selectionId}>{selection}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
    </div>
    {open && <StudentFilterDialog students={students} loading={loading} error={error} retry={retry} value={value} close={close}
      onApply={(studentId) => { onApply(studentId); close(); }} />}
  </>;
}

function StudentFilterDialog({ students, loading, error, retry, value, close, onApply }: StudentFilterProps & { close: () => void }) {
  const [draft, setDraft] = useState(value);
  const [query, setQuery] = useState('');
  const mobile = useMobileGraph();
  const searchField = useRef<HTMLInputElement>(null);
  const optionsList = useRef<HTMLFieldSetElement>(null);
  const group = useId();
  const terms = foldSearchText(query).split(/\s+/).filter(Boolean);
  const matches = students.filter((student) => {
    const text = foldSearchText(`${student.id} ${nodeName(student)}`);
    return terms.every((term) => text.includes(term));
  });
  const selected = students.find((student) => student.id === draft);
  const draftMissing = Boolean(draft) && !matches.some((student) => student.id === draft);
  const summary = selected ? `${selected.id} · ${nodeName(selected)}` : draft || noStudent;

  useEffect(() => {
    if (mobile) return;
    const frame = requestAnimationFrame(() => searchField.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [mobile]);

  return <Modal title="Trạng thái theo sinh viên" close={close}>
    <form onSubmit={(event) => { event.preventDefault(); onApply(draft); }}>
      <div className="modal-body graph-student-dialog">
        <SearchField inputRef={searchField} label="Tìm sinh viên" placeholder="Tìm tên hoặc mã sinh viên…"
          value={query} onQueryChange={(text) => {
            setQuery(text);
            if (optionsList.current) optionsList.current.scrollTop = 0;
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              const checked = optionsList.current?.querySelector<HTMLInputElement>('input:checked');
              (checked ?? optionsList.current?.querySelector<HTMLInputElement>('input'))?.focus();
            }
          }} />
        {error && !loading
          ? <ErrorNotice message={error} retry={retry} />
          : <p className="graph-student-result-count" role="status">
              {loading ? 'Đang tải danh sách sinh viên…' : matches.length
                ? `${formatNumber(matches.length)} sinh viên`
                : 'Không tìm thấy sinh viên phù hợp.'}
            </p>}
        <fieldset ref={optionsList} className="graph-student-options" aria-busy={loading}>
          <legend className="sr-only">Chọn sinh viên hiển thị trên đồ thị</legend>
          {!terms.length && <label className="graph-student-choice">
            <input type="radio" name={group} checked={draft === ''} onChange={() => setDraft('')} />
            <span>{noStudent}</span>
          </label>}
          {matches.map((student) => <label key={student.id} className="graph-student-choice">
            <input type="radio" name={group} checked={draft === student.id} onChange={() => setDraft(student.id)} />
            <span><strong>{nodeName(student)}</strong><small>{student.id}</small></span>
          </label>)}
        </fieldset>
        {draftMissing && <p className="graph-student-current">Đang chọn · {summary}</p>}
      </div>
      <div className="modal-actions">
        <button type="button" className="button secondary" onClick={close}>Hủy</button>
        <button type="submit" className="button primary">Áp dụng</button>
      </div>
    </form>
  </Modal>;
}
