// Report file access shared by the Reports workspace and the patient detail
// page. The file endpoint needs the auth header, so we fetch a blob and hand it
// to the browser via an object URL (opened in a tab or downloaded).
import { getToken } from './api'
import { API_BASE } from './apiBase'

export async function fetchReportBlob(reportId: number): Promise<Blob> {
  const token = getToken()
  const res = await fetch(`${API_BASE}/api/reports/${reportId}/file`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (!res.ok) throw new Error('Cannot fetch report file')
  return res.blob()
}

// เปิดไฟล์ผลแล็บในแท็บใหม่ (ดึง blob พร้อม auth แล้วสร้าง object URL ชั่วคราว)
export async function openReportFile(reportId: number): Promise<void> {
  const blob = await fetchReportBlob(reportId)
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

// ดาวน์โหลดไฟล์ผลแล็บลงเครื่อง (ดึง blob พร้อม auth แล้ว trigger ลิงก์ดาวน์โหลด)
export async function downloadReportFile(reportId: number, filename: string): Promise<void> {
  const blob = await fetchReportBlob(reportId)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
