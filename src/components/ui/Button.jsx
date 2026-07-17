import styles from './Button.module.css';

/**
 * Button — Illaki UI Button
 * variants: primary | secondary | ghost | danger
 * sizes: sm | md | lg
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  onClick,
  type = 'button',
  className = '',
  ...props
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={[
        styles.btn,
        styles[variant],
        styles[size],
        fullWidth ? styles.fullWidth : '',
        loading ? styles.loading : '',
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {loading ? (
        <span className={styles.spinner} aria-hidden="true" />
      ) : icon ? (
        <span className={styles.icon} aria-hidden="true">{icon}</span>
      ) : null}
      {children && <span>{children}</span>}
    </button>
  );
}
