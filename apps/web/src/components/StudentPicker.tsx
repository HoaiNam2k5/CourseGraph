import { useId, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { foldSearchText } from '../../../../packages/shared/src/search.js';
import { formatNumber, nodeName, type BusinessNode } from '../types.js';
import './student-picker.css';

interface StudentPickerProps {
  students: BusinessNode[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  searchable?: boolean;
}

export default function StudentPicker({
  students,
  value,
  onChange,
  label = 'Sinh viên',
  placeholder = 'Chọn sinh viên…',
  required = false,
  searchable = true,
}: StudentPickerProps) {
  const [query, setQuery] = useState('');
  const searchField = useRef<HTMLInputElement>(null);
  const selectField = useRef<HTMLSelectElement>(null);
  const selectId = useId();
  const keywords = searchable ? foldSearchText(query) : '';
  const matches = useMemo(() => {
    if (!keywords) return students;
    const terms = keywords.split(/\s+/);
    return students.filter((student) => {
      const text = foldSearchText(`${student.id} ${nodeName(student)}`);
      return terms.every((term) => text.includes(term));
    });
  }, [keywords, students]);
  const pinned = keywords && !matches.some((student) => student.id === value)
    ? students.find((student) => student.id === value)
    : undefined;

  return <div className="student-picker">
    {searchable && <>
      <div className="search-field student-picker-search">
        <Search size={17} aria-hidden="true" />
        <input ref={searchField} type="search" value={query} aria-label="Tìm sinh viên" aria-controls={selectId}
          placeholder="Tìm theo tên hoặc mã…" onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              selectField.current?.focus();
            }
          }} />
        {query && <button type="button" className="icon-button" aria-label="Xóa từ khóa tìm sinh viên"
          onClick={() => { setQuery(''); searchField.current?.focus(); }}><X size={15} aria-hidden="true" /></button>}
      </div>
      <p role="status" className={keywords && !matches.length ? 'student-picker-no-results' : 'sr-only'}>
        {keywords ? matches.length ? `${formatNumber(matches.length)} sinh viên phù hợp` : 'Không tìm thấy sinh viên phù hợp.' : ''}
      </p>
    </>}
    <label className="field">
      <span>{label}{required && <span className="required" aria-hidden="true"> *</span>}</span>
      <select ref={selectField} id={selectId} value={value} required={required} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {pinned && <optgroup label="Đang chọn"><option value={pinned.id}>{pinned.id} · {nodeName(pinned)}</option></optgroup>}
        {matches.map((student) => <option key={student.id} value={student.id}>{student.id} · {nodeName(student)}</option>)}
      </select>
    </label>
  </div>;
}
