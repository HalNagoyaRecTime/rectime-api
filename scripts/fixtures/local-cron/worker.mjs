export default {
  async scheduled(event, env) {
    await env.STATE.put(
      'scheduled',
      JSON.stringify({ cron: event.cron, scheduledTime: event.scheduledTime })
    );
    await env.DELIVERY.send({ cron: event.cron });
  },
  async queue(batch, env) {
    for (const message of batch.messages) {
      await env.STATE.put('queue', JSON.stringify(message.body));
      message.ack();
    }
  },
  async fetch(_request, env) {
    return Response.json({
      scheduled: JSON.parse((await env.STATE.get('scheduled')) ?? 'null'),
      queue: JSON.parse((await env.STATE.get('queue')) ?? 'null'),
    });
  },
};
