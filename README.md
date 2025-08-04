# Screenshot Automation State Machine

Screenshot automation state machine for automated screenshot capture, change detection, and quality validation.

## Overview

This project demonstrates a background monitoring system that automatically captures screenshots, detects visual changes, validates quality, and distributes results.

## Key Features

- **🔄 State Machine Architecture**: Event-driven workflow with distinct states and 3 execution modes
- **📸 Automated Screenshot Capture**: Multi-viewport screenshot automation using Puppeteer
- **🔍 Visual Change Detection**: Pixel-level diff analysis with configurable thresholds using pixelmatch
- **⏰ Flexible Scheduling**: Three execution modes: continuous monitoring, manual trigger, and scheduled execution
- **✅ Quality Validation**: Screenshot quality checks using Sharp image processing
- **📊 Audit Trail**: Execution summaries and quality reports
- **🏗️ Configuration-Driven**: JSON-based workflow configuration with factory patterns

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Chrome/Chromium browser (for Puppeteer)

### Installation & Setup

```bash
# Install dependencies
npm install

# Start demo server (in one terminal)
npm run demo:server

# Start monitoring (in another terminal)
npm run demo:monitor

# Open scr/output folder to check screnshots
```

## Project Structure

```
src/
├── state-machine/           # Core state machine engine
│   ├── StateMachine.ts     # Main state machine implementation
│   ├── State.ts            # State interface and base classes
│   ├── Event.ts            # Event system and builders
│   └── Transition.ts       # Transition management logic
├── types/                   # Type definitions and enums
│   ├── WorkflowMode.ts     # Workflow execution mode enums
│   ├── WorkflowState.ts    # State machine state enums
│   └── WorkflowEvent.ts    # State transition event enums
├── screenshot/             # Screenshot capture services
│   ├── ScreenshotService.ts # Puppeteer-based screenshot capture
│   ├── RecipeEngine.ts     # Automation recipe execution
│   └── QualityValidator.ts # Screenshot quality validation
├── monitoring/             # Change detection and monitoring
│   ├── ChangeDetector.ts   # Visual diff analysis using pixelmatch
│   └── Scheduler.ts        # Interval and cron-based scheduling
├── workflows/              # Workflow implementations
│   ├── ScreenshotWorkflow.ts # Main workflow orchestrator
│   ├── WorkflowBuilder.ts   # Configuration-driven workflow builder
│   ├── StateFactory.ts     # Factory pattern for state creation
│   ├── config/
│   │   └── workflow-config.json # Mode-specific workflow definitions
│   └── states/             # Individual state implementations
│       ├── MonitoringState.ts
│       ├── ChangeDetectionState.ts
│       ├── RecipeExecutionState.ts
│       ├── QualityAuditState.ts
│       ├── DistributionState.ts
│       ├── AuditCompleteState.ts      # Monitor mode completion
│       ├── TriggerCompleteState.ts    # Trigger mode completion
│       └── ScheduleCompleteState.ts   # Schedule mode completion
├── cli/                    # Command-line interface
│   ├── WorkflowValidator.ts # Configuration validation
│   └── validate-workflow.ts # CLI Workflow validation tool
├── demo/                   # Demo server and examples
│   └── DemoServer.ts       # Express server for testing
└── index.ts               # CLI entry point

tests/
├── unit/                   # Unit tests (88 tests)
│   ├── types/              # WorkflowMode enum tests
│   ├── state-machine/      # Core state machine tests
│   ├── workflows/states/   # Individual state tests
│   ├── monitoring/         # Change detection and scheduling tests
│   └── screenshot/         # Quality validation tests
└── integration/            # End-to-end workflow tests (69 tests)

config/
├── demo-config.json       # Development configuration
└── test-config.json       # Test environment settings

output/                     # Generated screenshots and reports
├── final/                  # Baseline screenshots (permanent)
├── temp/                   # Temporary comparison screenshots
├── diffs/                  # Visual difference images
├── quality-reports/        # Quality validation reports
└── audit-summaries/        # Workflow execution summaries
```

## State Machine Architecture

The system implements a state machine with three distinct execution modes and conditional state transitions.

### WorkflowMode System

The system supports three execution modes via a type-safe enum:

#### 1. 🔄 **Monitor Mode** (`WorkflowMode.MONITOR`)

- **Behavior**: Continuous monitoring with scheduled intervals
- **Workflow**: `MONITORING` → ... → `AUDIT_COMPLETE` → cycles back
- **Use Case**: Production monitoring with automated screenshots
- **Completion**: Returns to monitoring for next cycle

#### 2. ⚡ **Trigger Mode** (`WorkflowMode.TRIGGER`)

- **Behavior**: Immediate one-time execution
- **Workflow**: `CHANGE_DETECTION` → ... → `TRIGGER_COMPLETE` (terminal)
- **Use Case**: Manual testing and on-demand validation
- **Completion**: Exits after execution

#### 3. ⏰ **Schedule Mode** (`WorkflowMode.SCHEDULE`)

- **Behavior**: Waits for schedule, runs once, then exits
- **Workflow**: `MONITORING` → ... → `SCHEDULE_COMPLETE` (terminal)
- **Use Case**: Scheduled reports and automated captures
- **Completion**: Exits after single execution

### State Machine Workflow

The system uses 8 distinct states with conditional routing:

#### **Core Workflow States:**

##### 1. 🔍 **MONITORING**

- **Purpose**: Scheduling and trigger management
- **Actions**: Interval/cron scheduling, manual trigger handling
- **Transitions**:
  - `SCHEDULE_REACHED` → CHANGE_DETECTION
  - `MANUAL_TRIGGER` → CHANGE_DETECTION

##### 2. 🔎 **CHANGE_DETECTION**

- **Purpose**: Visual diff analysis against baselines
- **Actions**: Screenshot comparison using pixelmatch, baseline validation
- **Transitions**:
  - `VISUAL_CHANGE_DETECTED` → RECIPE_EXECUTION
  - `NO_CHANGE_DETECTED` → Mode-specific completion states

##### 3. 🎯 **RECIPE_EXECUTION**

- **Purpose**: Automated screenshot capture sequences
- **Actions**: Puppeteer automation, multi-viewport capture
- **Transitions**:
  - `SCREENSHOTS_CAPTURED` → QUALITY_AUDIT
  - `EXECUTION_FAILED` → MONITORING

##### 4. ✅ **QUALITY_AUDIT**

- **Purpose**: Screenshot quality validation
- **Actions**: Sharp-based quality checks, format validation
- **Transitions**:
  - `QUALITY_CHECK_PASSED` → DISTRIBUTION
  - `QUALITY_CHECK_FAILED` → RECIPE_EXECUTION

##### 5. 📤 **DISTRIBUTION**

- **Purpose**: File management and baseline updates
- **Actions**: Save screenshots, update baselines, cleanup temp files
- **Transitions**:
  - `SYNC_SUCCESSFUL` → Mode-specific completion states
  - `SYNC_FAILED` → MONITORING

#### **Mode-Specific Completion States:**

##### 6. ✅ **AUDIT_COMPLETE** (Monitor Mode)

- **Purpose**: Cycle completion and preparation for next iteration
- **Actions**: Generate reports, cleanup resources
- **Transitions**: `CYCLE_COMPLETE` → MONITORING

##### 7. ✅ **TRIGGER_COMPLETE** (Trigger Mode)

- **Purpose**: Manual trigger completion
- **Actions**: Generate completion summary, audit trail
- **Transitions**: None (terminal state)

##### 8. ✅ **SCHEDULE_COMPLETE** (Schedule Mode)

- **Purpose**: Scheduled execution completion
- **Actions**: Generate detailed audit summary with metrics
- **Transitions**: None (terminal state)

### Type-Safe Enum System

The system uses TypeScript enums for improved type safety and scalability:

#### **WorkflowState Enum**
```typescript
export enum WorkflowState {
  MONITORING = 'MONITORING',
  CHANGE_DETECTION = 'CHANGE_DETECTION',
  RECIPE_EXECUTION = 'RECIPE_EXECUTION',
  QUALITY_AUDIT = 'QUALITY_AUDIT',
  DISTRIBUTION = 'DISTRIBUTION',
  AUDIT_COMPLETE = 'AUDIT_COMPLETE',
  TRIGGER_COMPLETE = 'TRIGGER_COMPLETE',
  SCHEDULE_COMPLETE = 'SCHEDULE_COMPLETE',
}
```

#### **WorkflowEvent Enum**
```typescript
export enum WorkflowEvent {
  SCHEDULE_REACHED = 'SCHEDULE_REACHED',
  MANUAL_TRIGGER = 'MANUAL_TRIGGER',
  VISUAL_CHANGE_DETECTED = 'VISUAL_CHANGE_DETECTED',
  NO_CHANGE_DETECTED = 'NO_CHANGE_DETECTED',
  SCREENSHOTS_CAPTURED = 'SCREENSHOTS_CAPTURED',
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  QUALITY_CHECK_PASSED = 'QUALITY_CHECK_PASSED',
  QUALITY_CHECK_FAILED = 'QUALITY_CHECK_FAILED',
  SYNC_SUCCESSFUL = 'SYNC_SUCCESSFUL',
  SYNC_FAILED = 'SYNC_FAILED',
  CYCLE_COMPLETE = 'CYCLE_COMPLETE',
}
```

### Conditional State Transitions

The system uses enum-based conditional routing with backward compatibility:

```typescript
// Example: ChangeDetectionState transitions with type safety
TransitionBuilder.on(WorkflowEvent.NO_CHANGE_DETECTED)
  .goToIf(WorkflowState.TRIGGER_COMPLETE, (event, contextData) =>
    contextData.workflowMode === WorkflowMode.TRIGGER
  )
  .goToIf(WorkflowState.SCHEDULE_COMPLETE, (event, contextData) =>
    contextData.workflowMode === WorkflowMode.SCHEDULE
  )
  .goToIf(WorkflowState.AUDIT_COMPLETE, (event, contextData) =>
    contextData.workflowMode === WorkflowMode.MONITOR
  );

// Backward compatibility with strings is maintained
TransitionBuilder.on('NO_CHANGE_DETECTED').goTo('TRIGGER_COMPLETE');
```

## Usage

### CLI Commands

```bash
# Continuous monitoring (runs indefinitely)
npm run demo:monitor
# Equivalent to: tsx src/index.ts --mode=monitor

# Manual one-time trigger (immediate execution)
npm run demo:trigger
# Equivalent to: tsx src/index.ts --mode=trigger

# Scheduled one-time execution (waits for schedule)
npm run demo:schedule
# Equivalent to: tsx src/index.ts --mode=schedule

# Start demo server for testing
npm run demo:server
```

### Configuration

The system uses JSON configuration files (for demo purposes):

#### Main Configuration (`config/demo-config.json`):

```json
{
  "monitoring": {
    "interval": 1 // Minutes between monitoring cycles
  },
  "screenshots": {
    "formats": ["png"], // Supported: png, jpeg
    "viewports": [
      { "width": 1920, "height": 1080, "name": "desktop" },
      { "width": 390, "height": 844, "name": "mobile" }
    ],
    "quality": 90, // JPEG quality (1-100)
    "timeout": 15000, // Navigation timeout in ms
    "waitForNavigation": true // Wait for page load completion
  },
  "changeDetection": {
    "threshold": 0.1, // 10% change threshold for diff detection
    "includeAA": false, // Include anti-aliasing in diff analysis
    "alpha": 0.1, // Alpha channel transparency threshold
    "diffOutputDir": "./output/diffs" // Directory for diff images
  },
  "recipes": [
    {
      "name": "homepage-capture", // Recipe identifier
      "description": "Capture main pages", // Optional description
      "steps": [
        {
          "type": "navigate", // Step type (currently: navigate)
          "url": "http://localhost:3000",
          "filename": "homepage" // Output filename (without extension)
        },
        {
          "type": "navigate",
          "url": "http://localhost:3000/dashboard",
          "filename": "dashboard"
        }
      ]
    }
  ]
}
```

#### Configuration Options Explained:

- **`waitForNavigation`**: Ensures page fully loads before capturing
- **`includeAA`**: Controls anti-aliasing consideration in pixel diffs
- **`alpha`**: Threshold for alpha channel differences in RGBA comparison
- **`threshold`**: Percentage of pixels that must differ to trigger change detection

### Workflow Configuration (`src/workflows/config/workflow-config.json`):

```json
{
  "workflows": {
    "monitor": {
      "initialState": "MONITORING",
      "completionState": "AUDIT_COMPLETE",
      "states": [
        "MONITORING",
        "CHANGE_DETECTION",
        "RECIPE_EXECUTION",
        "QUALITY_AUDIT",
        "DISTRIBUTION",
        "AUDIT_COMPLETE"
      ]
    },
    "trigger": {
      "initialState": "CHANGE_DETECTION",
      "completionState": "TRIGGER_COMPLETE",
      "states": [
        "CHANGE_DETECTION",
        "RECIPE_EXECUTION",
        "QUALITY_AUDIT",
        "DISTRIBUTION",
        "TRIGGER_COMPLETE"
      ]
    },
    "schedule": {
      "initialState": "MONITORING",
      "completionState": "SCHEDULE_COMPLETE",
      "states": [
        "MONITORING",
        "CHANGE_DETECTION",
        "RECIPE_EXECUTION",
        "QUALITY_AUDIT",
        "DISTRIBUTION",
        "SCHEDULE_COMPLETE"
      ]
    }
  }
}
```

## Development

### Running Tests

```bash
# All tests
npm test

# Integration tests only
npm run test:integration
```

### Code Quality

```bash
# TypeScript type checking
npm run typecheck

# ESLint linting
npm run lint

# Prettier code formatting
npm run format

# Build TypeScript
npm run build
```

### Workflow Validation

```bash
# Validate workflow configurations
npm run validate:allworkflows
npm run validate:monitor
npm run validate:trigger
npm run validate:schedule
```

## Output & Reports

The system generates output in organized directories:

### File Organization

- **Baseline Files**: `output/final/filename-1920x1080.png` (permanent)
- **Temp Files**: `output/temp/filename-2025-08-03T21-25-07-450Z-1920x1080.png`
- **Diff Images**: `output/diffs/filename-diff-2025-08-03T21-25-07-450Z.png`
- **Quality Reports**: `output/quality-reports/quality-report-timestamp.json`
- **Audit Summaries**: `output/audit-summaries/mode-complete-timestamp.json`

### Audit Summary Example

```json
{
  "audit": {
    "timestamp": "2025-08-03T21:25:07.450Z",
    "type": "scheduled_execution",
    "duration": {
      "ms": 843,
      "seconds": 1,
      "formatted": "1s"
    }
  },
  "results": {
    "scheduleMode": true,
    "screenshots": {
      "total": 2,
      "formats": ["png"],
      "viewports": ["desktop", "mobile"],
      "totalSize": 1024000
    },
    "changes": {
      "detected": 1,
      "unchanged": 1,
      "averageChange": 15.2
    },
    "quality": {
      "passed": 2,
      "failed": 0,
      "averageScore": 98.5
    }
  },
  "files": {
    "homepage-1920x1080.png": "updated",
    "dashboard-390x844.png": "unchanged"
  },
  "nextActions": [
    "Scheduled execution completed successfully",
    "Baselines updated for changed screenshots",
    "State machine terminated"
  ]
}
```

## Technical Architecture

### Key Design Patterns

- **State Machine Pattern**: Finite state automaton with event-driven transitions
- **Factory Pattern**: Dynamic state creation through StateFactory
- **Builder Pattern**: WorkflowBuilder for configuration-driven setup
- **Service Layer Architecture**: Separation between core engine and services
- **Event-Driven Design**: EventEmitter-based loose coupling
- **Configuration-Driven Behavior**: JSON-based runtime configuration (for demo purposes)
- **Type-Safe Enum System**: Enum system with utility functions and type guards:
  - **WorkflowMode**: Execution mode selection (MONITOR, TRIGGER, SCHEDULE)
  - **WorkflowState**: State machine states
  - **WorkflowEvent**: Event types

### Technology Stack

- **TypeScript**: Strict typing with ES modules
- **Puppeteer**: Headless Chrome automation
- **Sharp**: High-performance image processing
- **Pixelmatch**: Pixel-level image comparison
- **Node-Cron**: Flexible scheduling with cron expressions
- **Vitest**: Modern testing framework with V8 coverage
- **ESLint + Prettier**: Code quality and formatting
- **Express**: Demo server for local testing
