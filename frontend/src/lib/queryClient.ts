import { QueryClient } from '@tanstack/react-query'

// React Query client กลางของแอป — ตั้งค่า default: cache 30 วิ, retry 1 ครั้งสำหรับ query,
// ไม่ refetch ตอนสลับ tab; ใช้ร่วมทุกหน้าเพื่อ cache ข้อมูลจาก backend
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
})
