import express from 'express';
import { Server } from 'http';

export interface DemoServerConfig {
  port: number;
  host: string;
  staticDir?: string;
}

interface ServerError {
  code: string;
  message: string;
}

export class DemoServer {
  private app: express.Application;
  private server: Server | null = null;
  private config: DemoServerConfig;

  constructor(config: Partial<DemoServerConfig> = {}) {
    this.config = {
      port: 3000,
      host: 'localhost',
      ...config,
    };

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Static files if configured
    if (this.config.staticDir) {
      this.app.use('/static', express.static(this.config.staticDir));
    }

    // CORS for development
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept'
      );
      next();
    });
  }

  private setupRoutes(): void {
    // Homepage
    this.app.get('/', (req, res) => {
      res.send(this.generateHomePage());
    });

    // Dashboard
    this.app.get('/dashboard', (req, res) => {
      res.send(this.generateDashboardPage());
    });

    // API endpoints for mock integrations
    this.app.get('/api/stats', (req, res) => {
      res.json({
        users: Math.floor(Math.random() * 1000) + 500,
        screenshots: Math.floor(Math.random() * 5000) + 1000,
        uptime: '99.9%',
        lastUpdate: new Date().toISOString(),
      });
    });

    this.app.get('/api/screenshots', (req, res) => {
      res.json([
        {
          id: 1,
          name: 'homepage.png',
          size: '1.2MB',
          created: '2024-01-15T10:00:00Z',
        },
        {
          id: 2,
          name: 'dashboard.png',
          size: '890KB',
          created: '2024-01-15T10:05:00Z',
        },
      ]);
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    });
  }

  private generateHomePage(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Screenshot Automation Demo</title>
    <style>
        ${this.getBaseStyles()}
        .hero {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 4rem 0;
            text-align: center;
        }
        .hero h1 { font-size: 3rem; margin-bottom: 1rem; }
        .hero p { font-size: 1.2rem; opacity: 0.9; }
        .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; padding: 3rem 0; }
        .feature { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .feature h3 { color: #333; margin-bottom: 1rem; }
        .cta { background: #f8f9fa; padding: 0 0; text-align: center; }
        .btn-primary { background: #007bff; color: white; padding: 1rem 2rem; text-decoration: none; border-radius: 5px; display: inline-block; margin: 0.5rem; }
        .btn-primary:hover { background: #0056b3; }
    </style>
</head>
<body>
    ${this.getNavigationHeader()}

    <div class="hero">
        <div class="container">
            <h1>Screenshot Automation Platform</h1>
            <p>Automated screenshot capture and quality assurance for modern web applications</p>
            <div style="margin-top: 2rem;">
                <a href="/" class="btn-primary">Get Started</a>
                <a href="/" class="btn-primary">Learn More</a>
            </div>
        </div>
    </div>

    <div class="container">
        <div class="features">
            <div class="feature">
                <h3>🤖 Automated Capture</h3>
                <p>State machine screenshot automation with change detection and quality validation.</p>
            </div>
            <div class="feature">
                <h3>📊 Quality Assurance</h3>
                <p>Quality checks for file size, dimensions, format validation.</p>
            </div>
            <div class="feature">
                <h3>🔄 Continuous Monitoring</h3>
                <p>Background monitoring with scheduled execution.</p>
            </div>
        </div>
    </div>

    <div class="cta">
        <div class="container">
            <h2>Ready to automate your screenshots?</h2>
            <p>Join thousands of teams using our platform for reliable screenshot automation.</p>
            <a href="/login" class="btn-primary">Start Free Trial</a>
        </div>
    </div>

    ${this.getFooter()}
</body>
</html>`;
  }

  private generateDashboardPage(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard - Screenshot Automation Demo</title>
    <style>
        ${this.getBaseStyles()}
        .dashboard-header { background: #f8f9fa; padding: 2rem 0; border-bottom: 1px solid #e9ecef; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin: 2rem 0; }
        .stat-card { background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .stat-value { font-size: 2rem; font-weight: bold; color: #007bff; margin-bottom: 0.5rem; }
        .stat-label { color: #666; font-size: 0.9rem; }
        .recent-activity { background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-top: 2rem; }
        .activity-item { padding: 1rem; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center; }
        .activity-item:last-child { border-bottom: none; }
        .status-badge { padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.8rem; font-weight: 600; }
        .status-success { background: #d4edda; color: #155724; }
        .status-warning { background: #fff3cd; color: #856404; }
        .status-error { background: #f8d7da; color: #721c24; }
    </style>
</head>
<body>
    ${this.getNavigationHeader()}

    <div class="dashboard-header">
        <div class="container">
            <h1>Dashboard</h1>
            <p>Monitor your screenshot automation workflows</p>
        </div>
    </div>

    <!-- NEW NOTIFICATION BANNER FOR TESTING CHANGE DETECTION -->
    <!--
    <div style="background: #ff6b6b; color: white; padding: 1rem; text-align: center; margin: 1rem 0; border-radius: 5px;">
        🚨 <strong>ALERT:</strong> Dashboard Updated! This banner tests change detection.
    </div> -->

    <div class="container">
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">1,247</div>
                <div class="stat-label">Total Screenshots</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">98.5%</div>
                <div class="stat-label">Success Rate</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">3</div>
                <div class="stat-label">Active Workflows</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">2.3s</div>
                <div class="stat-label">Avg Processing Time</div>
            </div>
        </div>

        <div class="recent-activity">
            <h3>Recent Activity</h3>
            <div class="activity-item">
                <div>
                    <strong>Homepage Screenshot</strong><br>
                    <small>Workflow: main-site-monitoring</small>
                </div>
                <div>
                    <span class="status-badge status-success">Completed</span>
                    <small style="margin-left: 1rem;">2 min ago</small>
                </div>
            </div>
            <div class="activity-item">
                <div>
                    <strong>Quality Audit Failed</strong><br>
                    <small>Workflow: product-pages</small>
                </div>
                <div>
                    <span class="status-badge status-error">Failed</span>
                    <small style="margin-left: 1rem;">5 min ago</small>
                </div>
            </div>
            <div class="activity-item">
                <div>
                    <strong>Change Detection</strong><br>
                    <small>Workflow: user-dashboard</small>
                </div>
                <div>
                    <span class="status-badge status-warning">In Progress</span>
                    <small style="margin-left: 1rem;">8 min ago</small>
                </div>
            </div>
            <div class="activity-item">
                <div>
                    <strong>Scheduled Monitoring</strong><br>
                    <small>Workflow: all-pages</small>
                </div>
                <div>
                    <span class="status-badge status-success">Completed</span>
                    <small style="margin-left: 1rem;">15 min ago</small>
                </div>
            </div>
        </div>
    </div>

    ${this.getFooter()}
</body>
</html>`;
  }

  private getBaseStyles(): string {
    return `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background: #f8f9fa; }
      .container { max-width: 1200px; margin: 0 auto; padding: 0 1rem; }
      .form-group { margin-bottom: 1rem; }
      .form-group label { display: block; margin-bottom: 0.5rem; font-weight: 600; }
      .form-group input, .form-group select, .form-group textarea { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 5px; }
      .btn-primary { background: #007bff; color: white; padding: 0.75rem 1.5rem; text-decoration: none; border-radius: 5px; display: inline-block; border: none; cursor: pointer; }
      .btn-primary:hover { background: #0056b3; }
    `;
  }

  private getNavigationHeader(): string {
    return `
    <nav style="background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 1rem 0;">
        <div class="container" style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 1.5rem; font-weight: bold; color: #007bff;">
                <a href="/" style="text-decoration: none; color: inherit;">📸 ScreenshotPOC</a>
            </div>
            <div style="display: flex; gap: 2rem; align-items: center;">
                <a href="/" style="text-decoration: none; color: #333;">Home</a>
                <a href="/dashboard" style="text-decoration: none; color: #333;">Dashboard</a>
            </div>
        </div>
    </nav>`;
  }

  private getFooter(): string {
    return `
    <footer style="background: #343a40; color: white; padding: 2rem 0; margin-top: 4rem;">
        <div class="container" style="text-align: center;">
            <p>Screenshot Automation POC.</p>
        </div>
    </footer>`;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.config.port, this.config.host, () => {
        process.stdout.write(
          `Demo server running at http://${this.config.host}:${this.config.port}\n`
        );
        resolve();
      });

      this.server.on('error', (error: ServerError) => {
        if (error.code === 'EADDRINUSE') {
          process.stderr.write(`Port ${this.config.port} is already in use\n`);
        }
        reject(new Error(error.message || 'Server error'));
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise(resolve => {
      if (this.server) {
        this.server.close(() => {
          process.stdout.write('Demo server stopped\n');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getConfig(): DemoServerConfig {
    return { ...this.config };
  }

  getApp(): express.Application {
    return this.app;
  }
}

// Allow running the server directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new DemoServer();

  server.start().catch(error => {
    process.stderr.write(`Failed to start demo server: ${error}\n`);
    process.exit(1);
  });

  process.on('SIGINT', () => {
    process.stdout.write('\nShutting down demo server...\n');
    server
      .stop()
      .then(() => {
        process.exit(0);
      })
      .catch(() => {
        process.exit(1);
      });
  });
}
