import { useRef, type ComponentPropsWithoutRef, type RefObject } from 'react';
import { Search, X } from 'lucide-react';

type SearchFieldProps = Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'className' | 'value' | 'onChange'> & {
  label: string;
  value: string;
  onQueryChange: (query: string) => void;
  className?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
};

export default function SearchField({
  label,
  value,
  onQueryChange,
  className,
  inputRef,
  placeholder = 'Tìm theo tên hoặc mã…',
  ...inputProps
}: SearchFieldProps) {
  const localRef = useRef<HTMLInputElement>(null);
  const field = inputRef ?? localRef;

  return <div className={className ? `search-field ${className}` : 'search-field'}>
    <label className="search-input">
      <Search size={17} aria-hidden="true" />
      <input {...inputProps} ref={field} type="search" aria-label={label} placeholder={placeholder}
        value={value} onChange={(event) => onQueryChange(event.target.value)} />
    </label>
    {value && <button className="icon-button search-clear" type="button" aria-label="Xóa từ khóa tìm kiếm"
      onClick={() => { onQueryChange(''); field.current?.focus(); }}>
      <X size={16} aria-hidden="true" />
    </button>}
  </div>;
}
