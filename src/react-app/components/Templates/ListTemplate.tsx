import React from 'react';
import styles from './templates.module.css';

interface ListItem {
  id: string | number;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  badge?: string;
  actions?: React.ReactNode;
}

interface ListTemplateProps {
  title: string;
  items: ListItem[];
  onItemClick?: (item: ListItem) => void;
  emptyMessage?: string;
}

export const ListTemplate: React.FC<ListTemplateProps> = ({
  title,
  items,
  onItemClick,
  emptyMessage = 'No items found',
}) => {
  return (
    <div className={styles.pageLayout}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{title}</h1>
      </div>

      {/* List */}
      <div className={styles.list}>
        {items.length > 0 ? (
          items.map((item) => (
            <div
              key={item.id}
              className={`${styles.listItem} ${onItemClick ? styles.clickable : ''}`}
              onClick={() => onItemClick?.(item)}
            >
              {item.icon && <div className={styles.listIcon}>{item.icon}</div>}

              <div className={styles.listContent}>
                <h3 className={styles.listTitle}>{item.title}</h3>
                {item.description && <p className={styles.listDescription}>{item.description}</p>}
              </div>

              <div className={styles.listRight}>
                {item.badge && <span className={styles.badge}>{item.badge}</span>}
                {item.actions && <div onClick={(e) => e.stopPropagation()}>{item.actions}</div>}
              </div>
            </div>
          ))
        ) : (
          <div className={styles.emptyState}>
            <p>{emptyMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ListTemplate;
