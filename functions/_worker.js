import { generateImages, getJob, getJobPayload, putJob, putJobImages } from './api/_shared.js'
export { JobStore } from './job-store.js'

function summarizeProviderData(data) {
  if (!data || typeof data !== 'object') return data
  const count = Array.isArray(data.images) ? data.images.length : Array.isArray(data.data) ? data.data.length : 0
  return { imageCount: count }
}

export default {
  async queue(batch, env) {
    for (const message of batch.messages) {
      const messageBody = message.body
      const clientId = messageBody.clientId || messageBody.job?.clientId
      const jobId = messageBody.jobId || messageBody.job?.id
      const payload = messageBody.request ? messageBody : await getJobPayload(env, clientId, jobId)
      const job = messageBody.job || await getJob(env, clientId, jobId)
      if (!payload || !job) throw new Error('job payload not found')

      console.log('queue job received', {
        jobId,
        clientId,
        hasEndpoint: Boolean(payload?.endpoint),
      })

      const startedAt = new Date().toISOString()
      const baseJob = {
        ...job,
        startedAt,
        attempts: (job.attempts || 0) + 1,
      }
      await putJob(env, baseJob)
      console.log('queue job started', {
        jobId: baseJob.id,
        clientId: baseJob.clientId,
        startedAt,
      })

      try {
        const { images, data } = await generateImages(payload.endpoint, payload.apiKey, payload.request)
        const storedImages = await putJobImages(env, baseJob.clientId, baseJob.id, images)
        await putJob(env, {
          ...baseJob,
          status: 'success',
          progress: 100,
          images: storedImages,
          raw: summarizeProviderData(data),
          finishedAt: new Date().toISOString(),
        })
        console.log('queue job succeeded', {
          jobId: baseJob.id,
          clientId: baseJob.clientId,
        })
        message.ack()
      } catch (err) {
        await putJob(env, {
          ...baseJob,
          status: 'error',
          progress: 100,
          error: err.message || 'generation failed',
          finishedAt: new Date().toISOString(),
        })
        console.log('queue job failed', {
          jobId: baseJob.id,
          clientId: baseJob.clientId,
          error: err.message || 'generation failed',
        })
        message.ack()
      }
    }
  },
}
