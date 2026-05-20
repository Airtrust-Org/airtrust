import React from 'react';
import styles from './templates.module.css';

interface DetailField {
  label: string;
  value: string | number | React.ReactNode;
  badge?: string;
}

interface DetailTemplateProps {
  title: string;
  subtitle?: string;
  fields: DetailField[];
  headerImage?: string;
  actions?: React.ReactNode;
  backButton?: React.ReactNode;
}

export const DetailTemplate: React.FC<DetailTemplateProps> = ({
  title,
  subtitle,
  fields,
  headerImage,
  actions,
  backButton,
}) => {
  return (
    <div className={styles.pageLayout}>
      {/* Header */}
      <div className={styles.detailHeader}>
        {backButton && <div className={styles.backButton}>{backButton}</div>}
        <div className={styles.headerContent}>
          {headerImage && <img src={headerImage} alt={title} className={styles.headerImage} />}
          <div>
            <h1 className={styles.pageTitle}>{title}</h1>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
        </div>
        {actions && <div className={styles.detailActions}>{actions}</div>}
      </div>

      {/* Details Grid */}
      <div className={styles.detailsGrid}>
        {fields.map((field, idx) => (
          <div key={idx} className={styles.detailField}>
            <label className={styles.detailLabel}>{field.label}</label>
            <div className={styles.detailValue}>
              {field.value}
              {field.badge && <span className={styles.badge}>{field.badge}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DetailTemplate;
