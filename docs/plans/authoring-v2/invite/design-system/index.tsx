/**
 * 模拟“用户产品里本来就有的组件”：普通 React，受控写法，不认识 Joplo。
 * 真实项目里这里是 `../src/components`，Joplo 项目放在产品仓库的某个子目录里直接 import。
 * 这个文件按 React 的 JSX 编译（不是 @joplo-app/kit 的 JSX），见提案 E3。
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './ds.css';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' };
export function Button({ variant = 'primary', className = '', ...rest }: ButtonProps) {
  return <button className={`ds-btn ds-btn--${variant} ${className}`} {...rest} />;
}

type FieldProps = {
  id?: string; label: string; value: string; onChange: (value: string) => void;
  placeholder?: string; multiline?: boolean; hint?: string;
};
export function TextField({ id, label, value, onChange, placeholder, multiline, hint }: FieldProps) {
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <label className="ds-field">
      <span>{label}</span>
      <Tag id={id} value={value} placeholder={placeholder} onChange={e => onChange(e.currentTarget.value)} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

type SelectProps = { id?: string; label: string; value: string; options: string[]; onChange: (value: string) => void; hint?: string };
export function Select({ id, label, value, options, onChange, hint }: SelectProps) {
  return (
    <label className="ds-field">
      <span>{label}</span>
      <select id={id} value={value} onChange={e => onChange(e.currentTarget.value)}>
        <option value="" disabled>请选择</option>
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
      {hint && <small>{hint}</small>}
    </label>
  );
}

type DialogProps = { id?: string; open: boolean; title: string; onClose: () => void; footer?: ReactNode; children: ReactNode };
export function Dialog({ id, open, title, onClose, footer, children }: DialogProps) {
  if (!open) return null;
  return (
    <div className="ds-backdrop" onClick={onClose}>
      <section id={id} role="dialog" aria-label={title} className="ds-dialog" onClick={e => e.stopPropagation()}>
        <header>{title}</header>
        <div className="ds-dialog__body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </section>
    </div>
  );
}

/** 产品自己的 Provider（主题、i18n 之类），Joplo 用 config.wrapper 包在舞台外面。 */
export function DesignSystemProvider({ children }: { children: ReactNode }) {
  return <div className="ds-root" data-theme="light">{children}</div>;
}
