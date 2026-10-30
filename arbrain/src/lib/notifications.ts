/**
 * Send a push notification when a task is assigned to someone.
 * Best-effort: failures are silently ignored so they never block UI.
 */
export async function notifyTaskAssigned(
  assigneeId: string,
  taskTitle: string,
  taskId: string,
  currentUserId?: string,
) {
  // Don't notify yourself
  if (currentUserId && assigneeId === currentUserId) return

  try {
    await fetch('/api/notifications/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: assigneeId,
        title: 'Nueva tarea asignada',
        body: taskTitle,
        url: '/',
        tag: `task-assigned-${taskId}`,
        source: 'tarea-asignada',
        kind: 'persona',
      }),
    })
  } catch {
    // Best-effort — never block the UI
  }
}
