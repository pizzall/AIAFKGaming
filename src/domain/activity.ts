export interface TimedActivity<T> {
  id: string;
  completeAt: number;
  status: 'pending' | 'completed';
  result: T;
  settledAt?: number;
}

export function settleActivity<T>(activity: TimedActivity<T>, serverNow: number) {
  if (!Number.isFinite(serverNow) || !Number.isFinite(activity.completeAt)) throw new Error('Invalid timestamp');
  if (activity.status === 'completed') return {activity: structuredClone(activity), newlyCompleted: false};
  if (serverNow < activity.completeAt) throw new Error('NOT_READY');
  return {activity: {...structuredClone(activity), status: 'completed' as const, settledAt: serverNow}, newlyCompleted: true};
}
