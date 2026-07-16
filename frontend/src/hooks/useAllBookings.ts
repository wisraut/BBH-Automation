import { useQueries, useQuery } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { BookingListResponse, BookingStatus } from './useBookings'

const PAGE_SIZE = 100

// ดึงรายการจองทั้งหมดของ status หนึ่งแบบครบทุกหน้า (ยิงหน้าแรกก่อนเพื่อรู้ total_pages
// แล้วยิงหน้าที่เหลือขนานกัน) ใช้ตอนต้องการชุดข้อมูลเต็มเช่น mount ลงปฏิทิน ไม่ใช่ inbox แบบแบ่งหน้า
export function useAllBookings(status: BookingStatus) {
  const page1 = useQuery({
    queryKey: ['bookings-all', status, 1],
    queryFn: () =>
      api.get<BookingListResponse>(
        `/api/bookings?${new URLSearchParams({ status, page: '1', limit: String(PAGE_SIZE) })}`
      ),
    staleTime: 60_000,
  })

  const totalPages = page1.data?.pagination.total_pages ?? 1
  const extraPages = totalPages > 1
    ? Array.from({ length: totalPages - 1 }, (_, i) => i + 2)
    : []

  const rest = useQueries({
    queries: extraPages.map((page) => ({
      queryKey: ['bookings-all', status, page],
      queryFn: () =>
        api.get<BookingListResponse>(
          `/api/bookings?${new URLSearchParams({ status, page: String(page), limit: String(PAGE_SIZE) })}`
        ),
      enabled: page1.isSuccess,
      staleTime: 60_000,
    })),
  })

  return {
    data: [
      ...(page1.data?.data ?? []),
      ...rest.flatMap((q) => q.data?.data ?? []),
    ],
    total: page1.data?.pagination.total ?? 0,
    isLoading: page1.isLoading || rest.some((q) => q.isLoading),
    isError: page1.isError,
  }
}
