// AuditReportPDF — Corporate PDF report with:
// - Split Tech branded header + watermark
// - Per-audit details table
// - Digital seal + timestamp
// - QR code footer linking to live verification
// Uses @react-pdf/renderer (server-side safe, no canvas)

import {
  Document, Page, Text, View, StyleSheet,
  Font, pdf,
} from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import type { AnalyticsLog } from '../../types'

// Register IBM Plex Sans Arabic subset via Google Fonts CDN
Font.register({
  family: 'IBMPlexArabic',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/ibmplexsansarabic/v6/Qw3NZRtWPQCuHme67tEYUIx3Kh0PHR9N6YPO_-D3tmvgtxE.woff2' },
    { src: 'https://fonts.gstatic.com/s/ibmplexsansarabic/v6/Qw3CZRtWPQCuHme67tEYUIx3Kh0PHR9N6YPO_-D3tmXIxQ.woff2', fontWeight: 700 },
  ],
})

// ── Brand tokens ──────────────────────────────────────────────────────────────
const G = {
  green:   '#006C35',
  dark:    '#012c14',
  lime:    '#AECC1E',
  gray50:  '#f8f9fa',
  gray200: '#e9ecef',
  gray500: '#6c757d',
  gray800: '#212529',
  white:   '#ffffff',
}

// ── Dynamic style helpers (outside StyleSheet — these are functions) ───────────
function scoreBadgeStyle(score: number): Style {
  return {
    width:           48,
    height:          48,
    borderRadius:    8,
    backgroundColor: score >= 80 ? '#d4edda' : score >= 60 ? '#fff3cd' : '#f8d7da',
    alignItems:      'center',
    justifyContent:  'center',
  }
}
function scoreBadgeTextStyle(score: number): Style {
  return {
    fontSize:   16,
    fontWeight: 700,
    color:      score >= 80 ? '#155724' : score >= 60 ? '#856404' : '#721c24',
  }
}

// ── Static styles ─────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily:      'IBMPlexArabic',
    fontSize:        10,
    color:           G.gray800,
    backgroundColor: G.white,
    paddingBottom:   80,
  },
  watermark: {
    position:      'absolute',
    top:           220,
    left:          80,
    fontSize:      60,
    color:         '#00000008',
    transform:     'rotate(-35deg)',
    fontWeight:    700,
    letterSpacing: 8,
  },
  header: {
    backgroundColor:  G.dark,
    paddingHorizontal: 40,
    paddingVertical:   24,
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
  },
  headerTitle: { color: G.white,  fontSize: 17, fontWeight: 700, textAlign: 'right' },
  headerSub:   { color: 'rgba(255,255,255,0.55)', fontSize: 9, textAlign: 'right', marginTop: 2 },
  accentBar:   { backgroundColor: G.lime, height: 4 },
  metaSection: {
    backgroundColor:  G.gray50,
    borderBottom:     `1pt solid ${G.gray200}`,
    paddingHorizontal: 40,
    paddingVertical:   18,
    flexDirection:    'row',
    justifyContent:   'space-between',
  },
  metaBlock: { flexDirection: 'column', gap: 3 },
  metaLabel: { fontSize: 8, color: G.gray500, textTransform: 'uppercase', letterSpacing: 0.5 },
  metaValue: { fontSize: 11, fontWeight: 700, color: G.dark },
  section: {
    paddingHorizontal: 40,
    paddingTop:        20,
    paddingBottom:     10,
  },
  sectionTitle: {
    fontSize:      11,
    fontWeight:    700,
    color:         G.green,
    borderBottom:  `1.5pt solid ${G.green}`,
    paddingBottom: 4,
    marginBottom:  12,
    textAlign:     'right',
  },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: {
    flex:            1,
    backgroundColor: G.gray50,
    border:          `1pt solid ${G.gray200}`,
    borderRadius:    6,
    padding:         12,
    alignItems:      'center',
  },
  statValue: { fontSize: 20, fontWeight: 700, color: G.dark },
  statLabel: { fontSize: 8, color: G.gray500, marginTop: 3, textAlign: 'center' },
  table:      { marginTop: 4 },
  tableHeader: {
    flexDirection:     'row',
    backgroundColor:   G.green,
    paddingVertical:   8,
    paddingHorizontal: 10,
    borderRadius:      4,
    marginBottom:      4,
  },
  tableHeaderCell: { color: G.white, fontSize: 9, fontWeight: 700, flex: 1, textAlign: 'right' },
  tableRow: {
    flexDirection:    'row',
    paddingVertical:  7,
    paddingHorizontal: 10,
    borderBottom:     `0.5pt solid ${G.gray200}`,
  },
  tableRowAlt: { backgroundColor: G.gray50 },
  tableCell:   { fontSize: 9, flex: 1, textAlign: 'right', lineHeight: 1.5 },
  seal: {
    marginHorizontal: 40,
    marginTop:        20,
    padding:          14,
    border:           `1.5pt solid ${G.green}`,
    borderRadius:     8,
    flexDirection:    'row',
    alignItems:       'center',
    gap:              12,
    backgroundColor:  '#f0fdf4',
  },
  sealTitle: { fontSize: 10, fontWeight: 700, color: G.green },
  sealMeta:  { fontSize: 8, color: G.gray500, marginTop: 2 },
  footer: {
    position:         'absolute',
    bottom:           0,
    left:             0,
    right:            0,
    backgroundColor:  G.dark,
    paddingHorizontal: 40,
    paddingVertical:   14,
    flexDirection:    'row',
    justifyContent:   'space-between',
    alignItems:       'center',
  },
  footerText:  { color: 'rgba(255,255,255,0.45)', fontSize: 8 },
  footerBrand: { color: G.lime, fontSize: 8, fontWeight: 700 },
  pageNumber:  { color: 'rgba(255,255,255,0.35)', fontSize: 8 },
  reasoningBox: {
    backgroundColor: '#f0fdf4',
    border:          `1pt solid ${G.green}`,
    borderRadius:    6,
    padding:         12,
    marginTop:       8,
  },
  reasoningText: { fontSize: 9, lineHeight: 1.6, color: G.dark, textAlign: 'right' },
})

// ── Status helpers ────────────────────────────────────────────────────────────
function statusLabel(s: string | null): string {
  return s === 'pass' ? 'ممتاز' : s === 'warning' ? 'تحذير' : s === 'fail' ? 'يحتاج تدخل' : '—'
}
function statusColor(s: string | null): string {
  return s === 'pass' ? '#155724' : s === 'warning' ? '#856404' : s === 'fail' ? '#721c24' : G.gray500
}

// ── Public interface ──────────────────────────────────────────────────────────
export interface DownloadReportOptions {
  storeName:       string
  merchantName:    string
  reportPeriod:    string
  generatedAt:     string
  qrToken:         string
  verificationUrl: string
  logs:            AnalyticsLog[]
}

interface DocProps {
  opts: DownloadReportOptions
}

function AuditReportDocument({ opts }: DocProps) {
  const { storeName, merchantName, reportPeriod, generatedAt, qrToken, verificationUrl, logs } = opts
  const totalAudits = logs.length
  const avgScore    = totalAudits
    ? Math.round(logs.reduce((a, l) => a + (l.score ?? 0), 0) / totalAudits)
    : 0
  const passCount = logs.filter(l => l.status === 'pass').length
  const passRate  = totalAudits ? Math.round((passCount / totalAudits) * 100) : 0

  return (
    <Document
      title={`تقرير التدقيق — ${storeName}`}
      author="سبلت تيك AI"
      subject="تقرير التدقيق التشغيلي الذكي"
      creator="ذكاء سبلت v3"
    >
      {/* ── PAGE 1: Summary ── */}
      <Page size="A4" style={S.page}>
        <Text style={S.watermark}>SPLIT TECH</Text>

        <View style={S.header}>
          <View>
            <Text style={S.headerTitle}>تقرير التدقيق التشغيلي</Text>
            <Text style={S.headerSub}>Operational Audit Report — ذكاء سبلت v3</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: G.lime, fontSize: 28, fontWeight: 700 }}>⬡</Text>
            <Text style={{ color: G.white, fontSize: 8, fontWeight: 700, marginTop: 2 }}>SPLIT</Text>
          </View>
        </View>
        <View style={S.accentBar} />

        {/* Meta */}
        <View style={S.metaSection}>
          <View style={S.metaBlock}>
            <Text style={S.metaLabel}>المتجر</Text>
            <Text style={S.metaValue}>{storeName}</Text>
          </View>
          <View style={S.metaBlock}>
            <Text style={S.metaLabel}>الفترة</Text>
            <Text style={S.metaValue}>{reportPeriod}</Text>
          </View>
          <View style={S.metaBlock}>
            <Text style={S.metaLabel}>أُنشئ بواسطة</Text>
            <Text style={S.metaValue}>{merchantName}</Text>
          </View>
          <View style={S.metaBlock}>
            <Text style={S.metaLabel}>تاريخ الإنشاء</Text>
            <Text style={[S.metaValue, { fontSize: 9 }]}>{generatedAt}</Text>
          </View>
        </View>

        {/* Summary Stats */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>ملخص الأداء</Text>
          <View style={S.statsRow}>
            <View style={S.statCard}>
              <Text style={S.statValue}>{totalAudits}</Text>
              <Text style={S.statLabel}>إجمالي عمليات التدقيق</Text>
            </View>
            <View style={S.statCard}>
              <Text style={[S.statValue, { color: avgScore >= 80 ? '#155724' : avgScore >= 60 ? '#856404' : '#721c24' }]}>
                {avgScore}
              </Text>
              <Text style={S.statLabel}>متوسط النقاط / 100</Text>
            </View>
            <View style={S.statCard}>
              <Text style={[S.statValue, { color: G.green }]}>{passRate}%</Text>
              <Text style={S.statLabel}>معدل النجاح</Text>
            </View>
            <View style={S.statCard}>
              <Text style={[S.statValue, { color: G.gray500 }]}>
                {logs.filter(l => l.status === 'warning').length}
              </Text>
              <Text style={S.statLabel}>تحذيرات</Text>
            </View>
          </View>
        </View>

        {/* Audit Table */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>تفاصيل عمليات التدقيق</Text>
          <View style={S.table}>
            <View style={S.tableHeader}>
              <Text style={[S.tableHeaderCell, { flex: 0.7 }]}>النقاط</Text>
              <Text style={[S.tableHeaderCell, { flex: 1 }]}>الحالة</Text>
              <Text style={[S.tableHeaderCell, { flex: 2 }]}>الملخص</Text>
              <Text style={[S.tableHeaderCell, { flex: 1.5 }]}>التاريخ</Text>
            </View>
            {logs.slice(0, 12).map((audit, i) => (
              <View key={audit.id} style={[S.tableRow, i % 2 === 1 ? S.tableRowAlt : {}]}>
                <Text style={[S.tableCell, { flex: 0.7, fontWeight: 700 }]}>{audit.score ?? '—'}</Text>
                <Text style={[S.tableCell, { flex: 1, color: statusColor(audit.status ?? null) }]}>
                  {statusLabel(audit.status ?? null)}
                </Text>
                <Text style={[S.tableCell, { flex: 2 }]}>
                  {(audit.summary ?? '—').slice(0, 80)}
                </Text>
                <Text style={[S.tableCell, { flex: 1.5 }]}>
                  {new Date(audit.created_at).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' }).slice(0, 16)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Digital Seal */}
        <View style={S.seal}>
          <Text style={{ fontSize: 20 }}>🔐</Text>
          <View>
            <Text style={S.sealTitle}>موثَّق رقمياً — سبلت تيك AI</Text>
            <Text style={S.sealMeta}>
              تاريخ الإنشاء: {generatedAt} | السجل التجاري: 7053975251 | جدة، المملكة العربية السعودية
            </Text>
            {qrToken ? (
              <Text style={S.sealMeta}>رمز التحقق: {qrToken} | {verificationUrl}</Text>
            ) : null}
          </View>
        </View>

        {/* Footer */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>{storeName} | {reportPeriod}</Text>
          <Text style={S.footerBrand}>SPLIT Tech | ذكاء سبلت</Text>
          <Text style={S.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* ── PAGE 2+: Per-audit observation pages ── */}
      {logs.filter(a => Array.isArray(a.observations) && a.observations.length > 0).slice(0, 6).map(audit => (
        <Page key={`obs-${audit.id}`} size="A4" style={S.page}>
          <Text style={S.watermark}>SPLIT TECH</Text>

          <View style={S.header}>
            <View>
              <Text style={S.headerTitle}>تفاصيل الملاحظات</Text>
              <Text style={S.headerSub}>{new Date(audit.created_at).toLocaleString('ar-SA')}</Text>
            </View>
            <Text style={{ color: G.lime, fontSize: 28 }}>⬡</Text>
          </View>
          <View style={S.accentBar} />

          <View style={S.section}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <View style={scoreBadgeStyle(audit.score ?? 0)}>
                <Text style={scoreBadgeTextStyle(audit.score ?? 0)}>{audit.score ?? '—'}</Text>
              </View>
              <View>
                <Text style={{ fontSize: 12, fontWeight: 700, color: G.dark }}>{storeName}</Text>
                <Text style={{ fontSize: 9, color: statusColor(audit.status ?? null), fontWeight: 700 }}>
                  {statusLabel(audit.status ?? null)}
                </Text>
              </View>
            </View>

            <Text style={S.sectionTitle}>الملاحظات التفصيلية</Text>
            <View style={S.table}>
              <View style={S.tableHeader}>
                <Text style={[S.tableHeaderCell, { flex: 1 }]}>السؤال</Text>
                <Text style={[S.tableHeaderCell, { flex: 1 }]}>الإجابة</Text>
              </View>
              {(audit.observations ?? []).map((obs: { question: string; answer: string }, i: number) => (
                <View key={i} style={[S.tableRow, i % 2 === 1 ? S.tableRowAlt : {}]}>
                  <Text style={[S.tableCell, { flex: 1 }]}>{obs.question}</Text>
                  <Text style={[S.tableCell, { flex: 1 }]}>{obs.answer}</Text>
                </View>
              ))}
            </View>

            {audit.ai_reasoning ? (
              <View style={{ marginTop: 16 }}>
                <Text style={S.sectionTitle}>تحليل الذكاء الاصطناعي</Text>
                <View style={S.reasoningBox}>
                  <Text style={S.reasoningText}>{audit.ai_reasoning}</Text>
                </View>
              </View>
            ) : null}
          </View>

          <View style={S.footer} fixed>
            <Text style={S.footerText}>{storeName}</Text>
            <Text style={S.footerBrand}>SPLIT Tech | ذكاء سبلت</Text>
            <Text style={S.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      ))}
    </Document>
  )
}

// ── Export function ───────────────────────────────────────────────────────────
export async function downloadAuditReportPDF(opts: DownloadReportOptions) {
  const blob = await pdf(<AuditReportDocument opts={opts} />).toBlob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `تقرير-${opts.storeName}-${opts.reportPeriod}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

export default AuditReportDocument
