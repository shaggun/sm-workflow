import { BaseState, StateContext } from '../../state-machine/State.js';
import { Event, EventBuilder } from '../../state-machine/Event.js';
import { Transition, TransitionBuilder } from '../../state-machine/Transition.js';
import { Scheduler, ScheduleConfig } from '../../monitoring/Scheduler.js';
import { WorkflowState } from '../../types/WorkflowState.js';
import { WorkflowEvent } from '../../types/WorkflowEvent.js';

export class MonitoringState extends BaseState {
  private scheduler: Scheduler;

  constructor() {
    super(WorkflowState.MONITORING);
    this.scheduler = new Scheduler();
  }

  async enter(context: StateContext): Promise<void> {
    await super.enter(context);
    
    const config = context.config as { monitoring?: { interval: number } };
    const monitoringConfig = config.monitoring || { interval: 1 };

    const scheduleConfig: ScheduleConfig = {
      interval: monitoringConfig.interval,
      runOnStart: true,
    };

    this.scheduler.on('scheduled', () => {
      context.data.triggerType = 'scheduled';
    });

    this.scheduler.on('manual', () => {
      context.data.triggerType = 'manual';
    });

    await this.scheduler.startScheduledMonitoring(scheduleConfig);
    context.logger.info(`Monitoring started with ${monitoringConfig.interval} minute interval`);
  }

  async execute(context: StateContext): Promise<Event | null> {
    // Check for manual trigger
    if (context.data.manualTrigger) {
      context.data.manualTrigger = false;
      return EventBuilder.manualTrigger();
    }

    // Wait for scheduled trigger
    if (context.data.triggerType === 'scheduled') {
      context.data.triggerType = null;
      return EventBuilder.scheduleReached();
    }

    // No trigger yet, wait
    await new Promise(resolve => setTimeout(resolve, 1000));
    return null;
  }

  async exit(context: StateContext): Promise<void> {
    context.logger.info('Stopping monitoring scheduler');
    await this.scheduler.stopScheduledMonitoring();
    await super.exit(context);
  }

  getTransitions(): Transition[] {
    return [
      TransitionBuilder.on(WorkflowEvent.SCHEDULE_REACHED).goTo(WorkflowState.CHANGE_DETECTION),
      TransitionBuilder.on(WorkflowEvent.MANUAL_TRIGGER).goTo(WorkflowState.CHANGE_DETECTION),
    ];
  }

  triggerManualRun(): void {
    this.scheduler.triggerManualRun();
  }

  getSchedulerStatus() {
    return this.scheduler.getSchedulerStatus();
  }
}