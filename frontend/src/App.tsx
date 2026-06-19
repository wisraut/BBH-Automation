import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { AuthProvider } from './contexts/AuthProvider'
import { queryClient } from './lib/queryClient'
import { Login } from './routes/Login'

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Login />
      </AuthProvider>
      {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  )
}

export default App
