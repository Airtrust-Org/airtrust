/**
 * Sistema de Monitoramento Contínuo para AirTrust
 * Coleta métricas de performance e saúde da aplicação
 */

export interface MetricEvent {
  name: string;
  value: number;
  tags?: Record<string, string>;
  timestamp?: number;
}

export interface ErrorEvent {
  error: string;
  stack?: string;
  user_id?: string;
  path?: string;
  timestamp?: number;
}

class MetricsCollector {
  private errorRate: number = 0;
  private apiResponseTimes: number[] = [];
  private pageLoadTimes: number[] = [];
  private userActions: string[] = [];
  private errors: ErrorEvent[] = [];

  constructor() {
    this.setupErrorTracking();
    this.setupPerformanceTracking();
  }

  private setupErrorTracking() {
    window.addEventListener('error', (event) => {
      this.trackError({
        error: event.message,
        stack: event.error?.stack,
        path: window.location.pathname,
        timestamp: Date.now()
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.trackError({
        error: `Unhandled Promise Rejection: ${event.reason}`,
        path: window.location.pathname,
        timestamp: Date.now()
      });
    });
  }

  private setupPerformanceTracking() {
    window.addEventListener('load', () => {
      const perfData = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (perfData) {
        const loadTime = perfData.loadEventEnd - perfData.loadEventStart;
        this.trackPageLoad(loadTime);
      }
    });

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'resource' && entry.name.includes('/api/')) {
          this.trackApiResponse(entry.duration);
        }
      }
    });

    observer.observe({ entryTypes: ['resource'] });
  }

  /**
   * Track API response time
   */
  trackApiResponse(responseTime: number, endpoint?: string) {
    this.apiResponseTimes.push(responseTime);
    
    if (this.apiResponseTimes.length > 100) {
      this.apiResponseTimes = this.apiResponseTimes.slice(-100);
    }

    if (responseTime > 200) {
      this.sendAlert('api_slow_response', {
        response_time: responseTime,
        endpoint: endpoint || 'unknown',
        threshold: 200
      });
    }
  }

  /**
   * Track error occurrences
   */
  trackError(errorEvent: ErrorEvent) {
    this.errors.push(errorEvent);
    
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const recentErrors = this.errors.filter(e => (e.timestamp || 0) > oneMinuteAgo);
    
    this.errorRate = recentErrors.length;
    
    const totalActions = this.userActions.length;
    if (totalActions > 0 && (recentErrors.length / totalActions) > 0.01) {
      this.sendAlert('high_error_rate', {
        error_rate: this.errorRate,
        errors_count: recentErrors.length,
        total_actions: totalActions
      });
    }

  }

  /**
   * Track page load time
   */
  trackPageLoad(loadTime: number) {
    this.pageLoadTimes.push(loadTime);
    
    if (this.pageLoadTimes.length > 50) {
      this.pageLoadTimes = this.pageLoadTimes.slice(-50);
    }

    if (loadTime > 3000) {
      this.sendAlert('slow_page_load', {
        load_time: loadTime,
        threshold: 3000,
        path: window.location.pathname
      });
    }
  }

  /**
   * Track user actions for calculating error rates
   */
  trackUserAction(action: string) {
    this.userActions.push(`${Date.now()}:${action}`);
    
    if (this.userActions.length > 1000) {
      this.userActions = this.userActions.slice(-1000);
    }
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics() {
    const avgApiResponse = this.apiResponseTimes.length > 0 
      ? this.apiResponseTimes.reduce((a, b) => a + b) / this.apiResponseTimes.length 
      : 0;

    const avgPageLoad = this.pageLoadTimes.length > 0
      ? this.pageLoadTimes.reduce((a, b) => a + b) / this.pageLoadTimes.length
      : 0;

    const recentErrors = this.errors.filter(e => 
      (e.timestamp || 0) > Date.now() - 60000
    );

    return {
      error_rate: this.errorRate,
      avg_api_response_time: Math.round(avgApiResponse),
      avg_page_load_time: Math.round(avgPageLoad),
      recent_errors_count: recentErrors.length,
      total_user_actions: this.userActions.length,
      last_updated: new Date().toISOString()
    };
  }

  /**
   * Send alert to monitoring system
   */
  private sendAlert(type: string, data: any) {
    const alert = {
      type,
      data,
      timestamp: new Date().toISOString(),
      user_agent: navigator.userAgent,
      url: window.location.href
    };

    
  }

  /**
   * Send metrics to monitoring dashboard
   */
  async sendMetrics() {
    const metrics = this.getMetrics();
    
    try {
      
    } catch (error) {
    }
  }
}

export const metricsCollector = new MetricsCollector();

setInterval(() => {
  metricsCollector.sendMetrics();
}, 5 * 60 * 1000);

export function useMetrics() {
  return {
    trackAction: (action: string) => metricsCollector.trackUserAction(action),
    trackError: (error: ErrorEvent) => metricsCollector.trackError(error),
    trackApiCall: (responseTime: number, endpoint: string) => 
      metricsCollector.trackApiResponse(responseTime, endpoint),
    getMetrics: () => metricsCollector.getMetrics()
  };
}

export default metricsCollector;
