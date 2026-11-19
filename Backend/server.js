import { createServer } from 'node:http'
import { loadEnvFromFile } from './src/config/loadEnv.js'
import { routeRequest } from './src/routes/projectRoutes.js'

loadEnvFromFile()

const basePort = Number(process.env.PORT || 5000)
const autoPortFallback = process.env.AUTO_PORT_FALLBACK === 'true'
const maxPortSearch = Number(process.env.MAX_PORT_SEARCH || 20)

const server = createServer((request, response) => {
	const startedAt = Date.now()
	const requestId = Math.random().toString(36).slice(2, 10)
	const { method, url } = request
	console.log(`[${requestId}] -> ${method} ${url}`)

	response.on('finish', () => {
		const elapsedMs = Date.now() - startedAt
		console.log(`[${requestId}] <- ${response.statusCode} (${elapsedMs}ms)`)
	})

	routeRequest(request, response)
})

function startServer(port, retriesLeft) {
	server.listen(port, () => {
		console.log(`Customer Project API listening on ${port}`)
	})

	server.once('error', error => {
		if (error?.code === 'EADDRINUSE') {
			if (autoPortFallback && retriesLeft > 0) {
				const nextPort = port + 1
				console.warn(`Port ${port} is already in use. Retrying on ${nextPort}...`)
				setTimeout(() => startServer(nextPort, retriesLeft - 1), 150)
				return
			}

			console.error(
				`Port ${port} is already in use. Stop the existing process or run with a different PORT.`,
			)
			process.exit(1)
		}

		console.error('Backend server failed to start:', error)
		process.exit(1)
	})
}

startServer(basePort, maxPortSearch)
