import React from 'react';
import styles from './templates.module.css';

interface DashboardTemplateProps {
  title: string;
  stats: Array<{
    label: string;
    value: string | number;
    change?: number;
    icon?: React.ReactNode;
  }>;
  children: React.ReactNode;
}

export const DashboardTemplate: React.FC<DashboardTemplateProps> = ({ title, stats, children }) => {
  return (
    <div className={styles.pageLayout}>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{title}</h1>
      </div>

      {/* Stats Grid */}
      <div className={styles.statsGrid}>
        {stats.map((stat, index) => (
          <div key={index} className={styles.statCard}>
            {stat.icon && <div className={styles.statIcon}>{stat.icon}</div>}
            <div className={styles.statContent}>
              <p className={styles.statLabel}>{stat.label}</p>
              <p className={styles.statValue}>{stat.value}</p>
              {stat.change !== undefined && (
                <p
                  className={`${styles.statChange} ${
                    stat.change >= 0 ? styles.positive : styles.negative
                  }`}
                >
                  {stat.change >= 0 ? '+' : ''}
                  {stat.change}%
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Main Content */}
      <div className={styles.contentGrid}>{children}</div>
    </div>
  );
};

export default DashboardTemplate;
