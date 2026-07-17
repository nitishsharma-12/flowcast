import { Component, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import html2canvas from 'html2canvas'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const WEEKS = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8']
const WEEK_LABELS = WEEKS.map((_, i) => `Week ${i + 1}`)
const weekLabel = (w) => `Week ${WEEKS.indexOf(w) + 1}`

const NAV_ITEMS = [
  { id: 'upload', label: 'Upload', icon: 'upload' },
  { id: 'forecast', label: 'Forecast', icon: 'forecast' },
  { id: 'overview', label: 'Overview', icon: 'overview' },
  { id: 'planning', label: 'Planning View', icon: 'planning' },
  { id: 'purchase-orders', label: 'Purchase Orders', icon: 'orders' },
  { id: 'assistant', label: 'AI Assistant', icon: 'assistant' },
  { id: 'sql', label: 'SQL Explorer', icon: 'sql' },
  { id: 'about', label: 'About', icon: 'about' },
]

const ITEM_CATEGORIES = [
  { label: 'Finished Good', ids: ['ELC001', 'ELC002', 'ITM001', 'ITM002'], match: /finished good/i },
  { label: 'Sub-Assembly', ids: ['SUB001', 'SUB002', 'SUB003', 'SUB004', 'ITM003', 'ITM004'], match: /sub-assembly/i },
  { label: 'Raw Material', ids: ['RAW001', 'RAW002', 'RAW003', 'RAW004', 'RAW005', 'RAW006', 'RAW007', 'ITM005', 'ITM006', 'ITM007'], match: /raw material/i },
  { label: 'Packaging', ids: ['PKG001', 'PKG002', 'ITM008'], match: /packaging/i },
]

const CHART_GREEN = '#34c759'

const QUICK_QUESTIONS = [
  'What should I order this week?',
  'Which items are at risk of stockout?',
  'Which POs arrive next week?',
  'Summarise supply chain health',
  'What is the release date for Raw Material Q?',
]

const CHART_QUICK_QUESTIONS = [
  'Chart PO costs this week',
  'Show inventory trend',
  'Demand vs supply chart',
  'Stockout risk chart',
]

const CHART_PALETTE = ['#2a78d6', '#1baf7a', '#f5a623', '#e74c3c', '#9b59b6', '#30b0c7', '#86868b']

const CHART_BLUE = '#0071e3'
const CHART_GRAY = '#86868b'
const CHART_TEAL = '#30b0c7'

const CHART_GRID = { stroke: '#e8e8ed', vertical: false }
const AXIS_STYLE = { tick: { fill: '#6e6e73', fontSize: 12 }, axisLine: false, tickLine: false }

function FlowcastLogo() {
  return (
    <svg className="flowcast-logo" width="170" height="36" viewBox="0 0 170 36" aria-label="Flowcast">
      <polygon points="14,1 25,7 25,21 14,27 3,21 3,7" fill="#2f80ed" />
      <line x1="7" y1="11" x2="21" y2="11" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <line x1="7" y1="15.5" x2="21" y2="15.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <line x1="7" y1="20" x2="18" y2="20" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <text
        x="32"
        y="20"
        fontFamily="-apple-system, BlinkMacSystemFont, SF Pro Display, Helvetica Neue, sans-serif"
        fontSize="18"
      >
        <tspan fontWeight="700" fill="#1d1d1f">flow</tspan>
        <tspan fontWeight="300" fill="#2f80ed">cast</tspan>
      </text>
      <text
        x="32"
        y="31"
        fontFamily="-apple-system, BlinkMacSystemFont, Helvetica Neue, sans-serif"
        fontSize="7.5"
        fill="#9e9e9e"
        letterSpacing="0.8"
      >
        Supply Chain Intelligence
      </text>
    </svg>
  )
}

function getItemCategory(item) {
  if (item?.category) return item.category
  if (!item) return 'Raw Material'
  for (const cat of ITEM_CATEGORIES) {
    if (cat.ids.includes(item.item_id)) return cat.label
    if (item.item_name && cat.match.test(item.item_name)) return cat.label
  }
  const id = (item.item_id || '').toUpperCase()
  if (id.startsWith('ELC') || id.startsWith('FG')) return 'Finished Good'
  if (id.startsWith('SUB')) return 'Sub-Assembly'
  if (id.startsWith('PKG')) return 'Packaging'
  if (id.startsWith('RAW')) return 'Raw Material'
  return 'Raw Material'
}

function getOrderTypeInfo(category) {
  switch (category) {
    case 'Finished Good':
      return { label: 'Production Order', badgeClass: 'order-type-production' }
    case 'Sub-Assembly':
      return { label: 'Work Order', badgeClass: 'order-type-work' }
    case 'Raw Material':
    case 'Packaging':
      return { label: 'Purchase Order', badgeClass: 'order-type-purchase' }
    default:
      return { label: 'Purchase Order', badgeClass: 'order-type-purchase' }
  }
}

function getCategoryBadgeClass(category) {
  switch (category) {
    case 'Finished Good': return 'category-badge-finished'
    case 'Sub-Assembly': return 'category-badge-subassembly'
    case 'Raw Material': return 'category-badge-raw'
    case 'Packaging': return 'category-badge-packaging'
    default: return 'category-badge-raw'
  }
}

function getActionQtyLabel(category) {
  switch (category) {
    case 'Finished Good': return 'Units to Produce'
    case 'Sub-Assembly': return 'Units to Assemble'
    default: return 'Units to Purchase'
  }
}

function getReleaseDateLabel(category) {
  switch (category) {
    case 'Finished Good': return 'Production Start Date'
    case 'Sub-Assembly': return 'Assembly Start Date'
    default: return 'PO Release Date'
  }
}

function getActionRequiredLine(category, w1) {
  const release = w1.release_date ? fmtPlanDate(w1.release_date) : 'immediately'
  const need = w1.need_date ? fmtPlanDate(w1.need_date) : null
  const fgProd = w1.fg_production_date ? fmtPlanDate(w1.fg_production_date) : null

  switch (category) {
    case 'Finished Good':
      return `Action required — Start production by ${release}`
    case 'Sub-Assembly':
      return `Action required — Must arrive by ${need || release}, release PO by ${release}`
    case 'Raw Material':
    case 'Packaging':
      if (fgProd) {
        return `Release PO by ${release} — components needed before production starts on ${fgProd}`
      }
      return `Release PO by ${release}${need ? ` — must arrive by ${need}` : ''}`
    default:
      return `Action required — Release PO by ${release}`
  }
}

function formatReleaseDisplay(category, row) {
  const need = row.need_date ? fmtPlanDateShort(row.need_date) : '—'
  const release = row.release_date ? fmtPlanDateShort(row.release_date) : '—'
  if (!row.release_date) return { text: '—', title: '' }

  switch (category) {
    case 'Finished Good':
      return { text: release, title: `Production start: ${fmtPlanDate(row.release_date)}` }
    case 'Sub-Assembly':
      return {
        text: release,
        title: `Must arrive by: ${need}, Release PO by: ${release}`,
      }
    default:
      return {
        text: release,
        title: `Must arrive by: ${need}, Release PO by: ${release}`,
      }
  }
}

function filterByItem(rows, itemId, key = 'item_id') {
  if (!itemId) return rows
  return rows.filter((r) => r[key] === itemId)
}

function getSelectedItem(items, itemId) {
  if (!itemId) return null
  return items.find((i) => i.item_id === itemId) || null
}

function weekStatus(row) {
  if (row.net_req > 0 || row.stockout_risk) return { label: 'Action required', cls: 'status-red' }
  if (row.projected_inventory <= row.safety_stock * 1.2) return { label: 'Low stock', cls: 'status-yellow' }
  return { label: 'Healthy', cls: 'status-green' }
}

function getWeekStatusReason(row, weeklyRows, weekIdx, item) {
  const prevInv = getPreviousInventory(weeklyRows, weekIdx, item)
  const gross = row.gross_req || 0
  const sched = row.scheduled_receipts || 0
  const safety = row.safety_stock ?? item?.safety_stock ?? 0
  const stockAfterDemand = prevInv + sched - gross

  if ((row.net_req || 0) <= 0 && (row.planned_order || 0) <= 0) {
    if (sched > 0 && gross > prevInv) return 'Covered by scheduled receipt'
    return 'Sufficient stock'
  }

  if (stockAfterDemand < safety && gross <= prevInv + sched) {
    return 'Below safety stock after demand'
  }

  if (gross > prevInv + sched) {
    return 'Net requirement exceeds available inventory'
  }

  if (sched > 0) return 'Covered by scheduled receipt'

  return 'Below safety stock after demand'
}

function buildW1ActionExplanation(w1, item, weeklyRows) {
  const available = Math.round(item?.available_qty ?? 0)
  const demand = Math.round(w1.gross_req || 0)
  const sched = Math.round(w1.scheduled_receipts || 0)
  const safety = Math.round(item?.safety_stock ?? w1.safety_stock ?? 0)
  const planned = Math.round(w1.planned_order || 0)
  const lot = item?.lot_size || 1
  const net = Math.round(w1.net_req || 0)
  const afterDemand = Math.round(available + sched - demand)
  const lots = net > 0 ? Math.ceil(net / lot) : 0

  if (planned <= 0 && net <= 0) {
    return null
  }

  if (afterDemand < safety && demand <= available + sched) {
    return `Stock drops to ${afterDemand} units after W1 demand — below safety stock of ${safety}. Order ${planned} units (${lots} lot${lots === 1 ? '' : 's'}) to maintain buffer.`
  }

  if (demand > available + sched) {
    return `Demand of ${demand} exceeds available inventory of ${available + sched}. Order ${planned} units (${lots} lot${lots === 1 ? '' : 's'}) to cover the gap and safety stock.`
  }

  return `Net requirement of ${net} units triggers a planned order of ${planned} (${lots} lot${lots === 1 ? '' : 's'}) to maintain the ${safety}-unit safety buffer.`
}

function fmtPlanDate(iso) {
  if (!iso) return '—'
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
}

function getPreviousInventory(weeklyRows, weekIdx, item) {
  if (weekIdx <= 0) return Math.round(item?.available_qty ?? 0)
  return Math.round(weeklyRows[weekIdx - 1]?.projected_inventory ?? 0)
}

function fmtPlanDateShort(iso) {
  if (!iso) return '—'
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const PLANNING_COLUMN_LABELS = {
  demand: 'Demand',
  stock: 'Stock',
  to_order: 'To Order',
  release_by: 'Release By',
  status: 'Status',
}

function buildPlanningPopoverContent(metric, row, weeklyRows, weekIdx, rowItem) {
  const wLabel = weekLabel(row.week)
  const itemName = rowItem?.item_name || row.item_id
  const columnName = PLANNING_COLUMN_LABELS[metric] || metric
  const prevInv = getPreviousInventory(weeklyRows, weekIdx, rowItem)
  const gross = Math.round(row.gross_req || 0)
  const sched = Math.round(row.scheduled_receipts || 0)
  const planned = Math.round(row.planned_order || 0)
  const projected = Math.round(row.projected_inventory || 0)
  const net = Math.round(row.net_req || 0)
  const safety = Math.round(row.safety_stock ?? rowItem?.safety_stock ?? 0)
  const lot = rowItem?.lot_size || 1
  const leadTime = rowItem?.lead_time_weeks ?? 0
  const netRaw = gross - prevInv - sched + safety

  let formula = ''

  switch (metric) {
    case 'demand':
      formula = `Gross Requirement (${wLabel})\n= Demand forecast for this week\n= ${gross} units`
      break
    case 'stock':
      formula = `Projected Inventory\n= Prev Stock + Incoming + Planned Order − Demand\n= ${prevInv} + ${sched} + ${planned} − ${gross}\n= ${projected} units`
      break
    case 'to_order':
      if (planned <= 0) {
        formula = `Planned Order\n= Net Req rounded up to Lot Size (${lot})\nNet Req = max(0, ${gross} − ${prevInv} − ${sched} + ${safety})\n= max(0, ${netRaw}) = ${net}\nNo order needed — sufficient stock available`
      } else {
        formula = `Planned Order\n= Net Req rounded up to Lot Size (${lot})\nNet Req = max(0, ${gross} − ${prevInv} − ${sched} + ${safety})\n= max(0, ${netRaw}) = ${net}\n→ Rounded to lot: ${planned} units`
      }
      break
    case 'release_by': {
      const needDate = row.need_date ? fmtPlanDateShort(row.need_date) : '—'
      const releaseDate = row.release_date ? fmtPlanDateShort(row.release_date) : '—'
      const fgProd = row.fg_production_date ? fmtPlanDateShort(row.fg_production_date) : null
      const category = getItemCategory(rowItem)

      if (category === 'Finished Good') {
        formula = `Production Start Date\n= Need Date − Lead Time\n= ${needDate} − ${leadTime} week${leadTime === 1 ? '' : 's'}\n= ${releaseDate}`
      } else if (category === 'Sub-Assembly') {
        formula = `Cascading Lead Time (Sub-Assembly)\nMust arrive by = Parent production start\n= ${needDate}\nRelease PO by = Need Date − Lead Time\n= ${needDate} − ${leadTime} week${leadTime === 1 ? '' : 's'}\n= ${releaseDate}`
      } else {
        formula = `Cascading Lead Time (Raw Material)\nMust arrive by = Parent production start\n= ${needDate}\nRelease PO by = Need Date − Lead Time\n= ${needDate} − ${leadTime} week${leadTime === 1 ? '' : 's'}\n= ${releaseDate}${fgProd ? `\nSupports FG production starting ${fgProd}` : ''}`
      }
      break
    }
    case 'status': {
      const st = weekStatus(row)
      const afterDemand = Math.round(prevInv + sched - gross)
      if (st.cls === 'status-red') {
        formula = `Status: Action Required\nStock drops to ${afterDemand} after demand — below safety stock of ${safety}`
      } else if (st.cls === 'status-yellow') {
        formula = `Status: Low Stock\nStock ${projected} is within 20% of safety stock ${safety} — monitor closely`
      } else {
        formula = `Status: Healthy\nStock ${projected} is above safety stock ${safety} — no action needed`
      }
      break
    }
    default:
      return null
  }

  return {
    formula,
    learnMore: `Explain how ${columnName} is calculated for ${itemName} in ${wLabel}`,
  }
}

function PlanningCalcPopover({ popover, onClose, onAskAI }) {
  const popoverRef = useRef(null)

  useEffect(() => {
    if (!popover) return undefined
    const onDown = (e) => {
      if (popoverRef.current?.contains(e.target)) return
      if (e.target.closest('.planning-value-btn')) return
      onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [popover, onClose])

  if (!popover) return null

  const { rect, content } = popover
  const spaceBelow = window.innerHeight - rect.bottom
  const showBelow = spaceBelow >= 180
  const centerX = Math.min(Math.max(rect.left + rect.width / 2, 170), window.innerWidth - 170)

  const style = showBelow
    ? { top: rect.bottom + 10, left: centerX, transform: 'translateX(-50%)' }
    : { bottom: window.innerHeight - rect.top + 10, left: centerX, transform: 'translateX(-50%)' }

  return createPortal(
    <div
      ref={popoverRef}
      className={`planning-calc-popover${showBelow ? '' : ' planning-calc-popover-above'}`}
      style={style}
      role="dialog"
      aria-label="How this was calculated"
    >
      <h4 className="planning-calc-popover-title">How this was calculated</h4>
      <pre className="planning-calc-formula">{content.formula}</pre>
      <button
        type="button"
        className="planning-calc-learn"
        onClick={() => {
          onClose()
          onAskAI?.(content.learnMore)
        }}
      >
        Learn more in AI Assistant →
      </button>
    </div>,
    document.body,
  )
}

function PlanningValueCell({
  value,
  popoverContent,
  className = '',
  cellKey,
  isOpen,
  onToggle,
  children,
}) {
  if (!popoverContent) {
    return <td className={className}>{children ?? value}</td>
  }

  return (
    <td className={`planning-value-cell ${className}`}>
      <button
        type="button"
        className={`planning-value-btn${isOpen ? ' planning-value-btn-open' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          onToggle(cellKey, e, popoverContent)
        }}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        {children ?? value}
      </button>
    </td>
  )
}

function buildPlanningMetricExplanation(metric, row, weeklyRows, weekIdx, item) {
  const w = row.week
  const wLabel = weekLabel(w)
  const prevInv = getPreviousInventory(weeklyRows, weekIdx, item)
  const gross = Math.round(row.gross_req || 0)
  const sched = Math.round(row.scheduled_receipts || 0)
  const planned = Math.round(row.planned_order || 0)
  const projected = Math.round(row.projected_inventory || 0)
  const net = Math.round(row.net_req || 0)
  const safety = Math.round(row.safety_stock ?? item?.safety_stock ?? 0)
  const lot = item?.lot_size || 1
  const leadTime = item?.lead_time_weeks ?? 0
  const netRaw = gross - prevInv - sched + safety
  const lots = net > 0 ? Math.ceil(net / lot) : 0

  const explanations = {
    gross_req: {
      heading: `Gross Requirement (${w})`,
      formula: 'Gross Requirement = Direct Demand + BOM Explosion',
      steps: [
        `Total demand for ${item?.item_name || row.item_id} in ${wLabel}:`,
        `= ${gross} units`,
        gross > 0 ? '(Includes forecast demand and quantities driven by parent assembly BOM)' : '',
      ].filter(Boolean),
      result: `${gross} units`,
      learnMore: `How is gross requirement calculated for ${item?.item_name || row.item_id} in ${wLabel}?`,
    },
    available_qty: {
      heading: `Available Stock (start of ${w})`,
      formula: 'Available Qty = On Hand − Allocated (from Inventory sheet)',
      steps: [
        `Inventory sheet Available_Qty for ${item?.item_name || row.item_id}`,
        `= ${Math.round(item?.available_qty ?? prevInv)} units`,
        w === 'W1' ? '(Starting balance before this week\'s MRP run)' : `(Carried from ${weekLabel(WEEKS[weekIdx - 1] || 'W1')} projected inventory: ${prevInv})`,
      ],
      result: `${Math.round(item?.available_qty ?? prevInv)} units`,
      learnMore: `What is the available inventory for ${item?.item_name || row.item_id}?`,
    },
    projected_inventory: {
      heading: `Projected Inventory (${w})`,
      formula: 'Projected Inventory = Previous Inventory + Scheduled Receipts + Planned Order − Demand',
      steps: [
        `= ${prevInv} + ${sched} + ${planned} − ${gross}`,
        `= ${projected} units`,
      ],
      result: `${projected} units`,
      learnMore: `Why is projected inventory ${projected} for ${item?.item_name || row.item_id} in ${wLabel}?`,
    },
    net_req: {
      heading: `Net Requirement (${w})`,
      formula: 'Net Requirement = max(0, Demand − Previous Inventory − Scheduled Receipts + Safety Stock)',
      steps: [
        `= max(0, ${gross} − ${prevInv} − ${sched} + ${safety})`,
        `= max(0, ${netRaw})`,
        net === 0 && netRaw <= 0 ? '= 0 (fully covered)' : `= ${net} units`,
      ],
      result: `${net} units`,
      learnMore: `Explain net requirement for ${item?.item_name || row.item_id} in ${wLabel}`,
    },
    planned_order: {
      heading: `Planned Order (${w})`,
      formula: 'Planned Order = Net Requirement rounded up to Lot Size',
      steps: net > 0
        ? [
            `Net Req: ${net} → Lot Size: ${lot}`,
            `= ${lots} lot${lots === 1 ? '' : 's'} × ${lot} = ${planned} units`,
          ]
        : ['Net requirement is 0 — no planned order needed', `= ${planned} units`],
      result: `${planned} units`,
      learnMore: `Why is the planned order ${planned} for ${item?.item_name || row.item_id} in ${wLabel}?`,
    },
    scheduled_receipts: {
      heading: `Scheduled Receipts (${w})`,
      formula: 'Scheduled Receipts = Sum of open PO quantities arriving this week',
      steps: [
        `Open POs for ${item?.item_name || row.item_id} arriving in ${wLabel}`,
        `= ${sched} units`,
      ],
      result: `${sched} units`,
      learnMore: `Which POs are scheduled for ${item?.item_name || row.item_id} in ${wLabel}?`,
    },
    release_date: {
      heading: `Release Date (${w})`,
      formula: 'Release Date = Need Date − Lead Time',
      steps: row.release_date && row.need_date
        ? [
            `= ${fmtPlanDate(row.need_date)} − ${leadTime} week${leadTime === 1 ? '' : 's'}`,
            `= ${fmtPlanDate(row.release_date)} (release by this date)`,
          ]
        : ['No release date — no planned order for this week'],
      result: row.release_date ? fmtPlanDate(row.release_date) : '—',
      learnMore: `When should I release the PO for ${item?.item_name || row.item_id} in ${wLabel}?`,
    },
    need_date: {
      heading: `Need Date (${w})`,
      formula: 'Need Date = Monday of the planning week',
      steps: [
        `${wLabel} need date in the planning horizon`,
        row.need_date ? `= ${fmtPlanDate(row.need_date)}` : '= Not scheduled',
      ],
      result: row.need_date ? fmtPlanDate(row.need_date) : '—',
      learnMore: `What is the need date for ${item?.item_name || row.item_id} in ${wLabel}?`,
    },
  }

  return explanations[metric] || null
}

function buildOverviewKpiExplanation(key, { summary, items, mrpResults, openPos, stockouts, selectedItemId, totalItems, openPoCount, ordersDueThisWeek }) {
  const itemMap = Object.fromEntries(items.map((i) => [i.item_id, i]))

  if (key === 'total_items') {
    const categories = {}
    items.forEach((item) => {
      const cat = getItemCategory(item)
      categories[cat] = (categories[cat] || 0) + 1
    })
    const breakdown = Object.entries(categories)
      .map(([cat, n]) => `${n} ${cat.toLowerCase()}`)
      .join(', ')
    return {
      heading: selectedItemId ? 'Selected Item' : 'Total Items',
      formula: 'Total Items = Unique item IDs in MRP results',
      steps: selectedItemId
        ? [`Viewing single item: ${itemMap[selectedItemId] || selectedItemId}`, '= 1 item']
        : [`= ${totalItems} items (${breakdown})`],
      result: `${totalItems} item${totalItems === 1 ? '' : 's'}`,
      learnMore: selectedItemId
        ? `Tell me about item ${selectedItemId}`
        : 'How many items are in my MRP plan and what types are they?',
    }
  }

  if (key === 'stockout_alerts') {
    return {
      heading: 'Stockout Risk Count',
      formula: 'Stockout Risk Count = Items where Projected Inventory < Safety Stock',
      steps: stockouts.length > 0
        ? [
            `Found: ${stockouts.map((s) => `${itemMap[s.item_id] || s.item_id} in ${s.week}`).join(', ')}`,
            `= ${stockouts.length} instance${stockouts.length === 1 ? '' : 's'} across 8 weeks`,
          ]
        : ['No weeks where projected inventory falls below safety stock', '= 0 instances'],
      result: `${stockouts.length} alert${stockouts.length === 1 ? '' : 's'}`,
      learnMore: 'Which items are at risk of stockout and when?',
    }
  }

  if (key === 'open_orders') {
    return {
      heading: 'Open Purchase Orders',
      formula: 'Open Orders = Count of rows in open_pos table',
      steps: [
        selectedItemId
          ? `POs for ${itemMap[selectedItemId] || selectedItemId}`
          : 'All open POs across all items',
        `= ${openPoCount} order${openPoCount === 1 ? '' : 's'}`,
      ],
      result: `${openPoCount}`,
      learnMore: selectedItemId
        ? `What open POs exist for ${itemMap[selectedItemId] || selectedItemId}?`
        : 'Summarize all open purchase orders',
    }
  }

  if (key === 'orders_due') {
    const w1Pos = (selectedItemId ? openPos.filter((p) => p.item_id === selectedItemId) : openPos)
      .filter((p) => p.expected_receipt_week === 'W1')
    return {
      heading: 'Orders Due This Week',
      formula: "Orders Due = Open POs where expected_receipt_week = 'W1'",
      steps: w1Pos.length > 0
        ? [
            `POs arriving in Week 1: ${w1Pos.map((p) => p.po_number).join(', ')}`,
            `= ${ordersDueThisWeek} order${ordersDueThisWeek === 1 ? '' : 's'}`,
          ]
        : ['No POs scheduled to arrive in Week 1', '= 0 orders'],
      result: `${ordersDueThisWeek}`,
      learnMore: 'Which POs arrive this week?',
    }
  }

  return null
}

function renderStepWithHighlights(step) {
  const parts = String(step).split(/(-?\d+(?:\.\d+)?)/g)
  return parts.map((part, i) => (
    /^-?\d/.test(part) ? <span key={i} className="calc-drilldown-val">{part}</span> : part
  ))
}

function CalcDrilldownModal({ content, anchor, onClose, onAskAI }) {
  if (!content) return null

  const style = anchor
    ? {
        top: Math.min(anchor.y, window.innerHeight - 320),
        left: Math.min(Math.max(anchor.x, 16), window.innerWidth - 380),
      }
    : {}

  return (
    <div className="calc-drilldown-backdrop" onClick={onClose}>
      <div
        className={`calc-drilldown-modal${anchor ? ' calc-drilldown-modal-anchored' : ''}`}
        style={style}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="calc-drilldown-title"
      >
        <div className="calc-drilldown-header">
          <h4 id="calc-drilldown-title">How this was calculated</h4>
          <button type="button" className="calc-drilldown-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className="calc-drilldown-heading">{content.heading}</p>
        <div className="calc-drilldown-formula">{content.formula}</div>
        <div className="calc-drilldown-steps">
          {content.steps.map((step, i) => (
            <p key={i} className="calc-drilldown-step">{renderStepWithHighlights(step)}</p>
          ))}
        </div>
        <p className="calc-drilldown-result">= <strong>{content.result}</strong></p>
        {content.learnMore && onAskAI && (
          <button
            type="button"
            className="calc-drilldown-learn"
            onClick={(e) => {
              e.stopPropagation()
              onAskAI(content.learnMore)
            }}
          >
            Learn more →
          </button>
        )}
      </div>
    </div>
  )
}

function getPlanningRowClass(st) {
  if (st.cls === 'status-red') return 'row-action-required'
  if (st.cls === 'status-yellow') return 'row-low-stock'
  return 'row-healthy'
}

function supplierInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function supplierColor(name) {
  const colors = ['#2a78d6', '#1baf7a', '#9b59b6', '#f5a623', '#e74c3c', '#30b0c7']
  let h = 0
  for (let i = 0; i < (name || '').length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return colors[Math.abs(h) % colors.length]
}

function poStatusBorderClass(status) {
  const s = (status || '').toLowerCase()
  if (s.includes('confirm')) return 'order-border-confirmed'
  if (s.includes('transit')) return 'order-border-transit'
  return 'order-border-pending'
}

function ClickableValue({ children, onDrillDown, className = '' }) {
  if (!onDrillDown) return <span className={className}>{children}</span>
  return (
    <button
      type="button"
      className={`clickable-value ${className}`}
      onClick={(e) => onDrillDown(e)}
    >
      {children}
    </button>
  )
}

function NavIcon({ type }) {
  const icons = {
    upload: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M8 11V4M5 7l3-3 3 3" /><path d="M3 13h10" />
      </svg>
    ),
    planning: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="2" width="12" height="12" rx="1" /><path d="M2 6h12M6 2v12" />
      </svg>
    ),
    overview: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="1" width="6" height="6" rx="1" /><rect x="9" y="1" width="6" height="6" rx="1" />
        <rect x="1" y="9" width="6" height="6" rx="1" /><rect x="9" y="9" width="6" height="6" rx="1" />
      </svg>
    ),
    forecast: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 12l3.5-3.5 2.5 2.5L14 4" /><path d="M10 4h4v4" />
      </svg>
    ),
    orders: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="3" width="12" height="10" rx="1" /><path d="M5 7h6M5 10h4" />
      </svg>
    ),
    assistant: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="6" /><path d="M5.5 9.5a2.5 2.5 0 0 1 5 0" />
      </svg>
    ),
    sql: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <ellipse cx="8" cy="3.5" rx="5.5" ry="2" /><path d="M2.5 3.5v9c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-9" /><path d="M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2" />
      </svg>
    ),
    about: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="6" /><path d="M8 7v4M8 5h.01" />
      </svg>
    ),
  }
  return <span className="nav-icon">{icons[type]}</span>
}

function UploadIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#86868b" strokeWidth="1.5">
      <path d="M24 32V16M16 24l8-8 8 8" />
      <path d="M8 36h32" />
    </svg>
  )
}

function Spinner({ label }) {
  return (
    <div className="spinner-wrap">
      <div className="spinner" />
      <p>{label}</p>
    </div>
  )
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Something went wrong' }
  }

  componentDidCatch(error, info) {
    console.error('Component error:', error, info)
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, message: '' })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary card">
          <h3>This section couldn’t be displayed</h3>
          <p>{this.state.message}</p>
          <button className="btn-secondary" onClick={() => this.setState({ hasError: false, message: '' })}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function ApiErrorBanner({ message, onRetry }) {
  if (!message) return null
  return (
    <div className="api-error-banner">
      <span>{message}</span>
      {onRetry && <button className="api-error-retry" onClick={onRetry}>Retry</button>}
    </div>
  )
}

function EmptyState({ onUpload }) {
  return (
    <div className="empty-state">
      <UploadIcon />
      <p className="empty-title">Upload a planning file to get started</p>
      <p className="empty-sub">Import your Excel file from your ERP system</p>
      {onUpload && (
        <button className="btn-primary" onClick={onUpload}>Upload file</button>
      )}
    </div>
  )
}

function PageHeader({ title, subtitle, lastUpdated }) {
  return (
    <header className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {lastUpdated && (
        <span className="last-updated">{formatLastUpdated(lastUpdated)}</span>
      )}
    </header>
  )
}

function formatLastUpdated(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const now = new Date()
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const dayDiff = Math.round((startOf(now) - startOf(d)) / 86400000)
  let day
  if (dayDiff === 0) day = 'Today'
  else if (dayDiff === 1) day = 'Yesterday'
  else day = d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  return `Last updated: ${day} at ${time}`
}

function formatTimestamp(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString()
}

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins === 1) return '1 min ago'
  if (mins < 60) return `${mins} mins ago`
  const hrs = Math.floor(mins / 60)
  if (hrs === 1) return '1 hour ago'
  if (hrs < 24) return `${hrs} hours ago`
  return formatTimestamp(iso)
}

function ItemSelector({ items, selectedItemId, onChange, hasData }) {
  if (!hasData || items.length === 0) return null

  const grouped = ITEM_CATEGORIES.map((cat) => ({
    ...cat,
    items: items.filter((i) => getItemCategory(i) === cat.label),
  })).filter((g) => g.items.length > 0)

  const uncategorized = items.filter(
    (i) => !ITEM_CATEGORIES.some((c) => getItemCategory(i) === c.label)
  )

  return (
    <div className="item-selector">
      <label htmlFor="global-item-select">ITEM</label>
      <select
        id="global-item-select"
        value={selectedItemId}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">All Items</option>
        {grouped.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.items.map((i) => (
              <option key={i.item_id} value={i.item_id}>
                {i.item_name} ({i.item_id})
              </option>
            ))}
          </optgroup>
        ))}
        {uncategorized.length > 0 && (
          <optgroup label="Other">
            {uncategorized.map((i) => (
              <option key={i.item_id} value={i.item_id}>
                {i.item_name} ({i.item_id})
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  )
}


function SyncStatus({ watchStatus, lastUpdated }) {
  const [, tick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60000)
    return () => clearInterval(id)
  }, [])

  if (!watchStatus) return null

  return (
    <div className="sync-status">
      <div className="sync-status-row">
        <span className={`sync-dot ${watchStatus.active ? '' : 'inactive'}`} />
        <span className="sync-label">
          {watchStatus.active ? 'Live sync active' : 'Sync inactive'}
        </span>
      </div>
      {watchStatus.filename ? (
        <>
          <p className="sync-filename">{watchStatus.filename}</p>
          <p className="sync-time">Last updated: {timeAgo(lastUpdated)}</p>
        </>
      ) : (
        <p className="sync-time">Waiting for file…</p>
      )}
    </div>
  )
}

function UploadPage({ apiUrl, onSuccess, onGoOverview, successData, onClearSuccess, onLoadSample }) {
  const [dragging, setDragging] = useState(false)
  const [validating, setValidating] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [loadingSample, setLoadingSample] = useState(false)
  const [error, setError] = useState('')
  const [syncPath, setSyncPath] = useState('')
  const [pendingFile, setPendingFile] = useState(null)
  const [validation, setValidation] = useState(null)
  const inputRef = useRef(null)

  const loadSample = async () => {
    if (loadingSample) return
    setError('')
    setLoadingSample(true)
    try {
      await onLoadSample?.()
    } catch (e) {
      setError(e?.message || 'Could not load sample data. Make sure the server is running.')
    } finally {
      setLoadingSample(false)
    }
  }

  useEffect(() => {
    fetch(`${apiUrl}/watch-status`)
      .then((r) => r.json())
      .then((d) => setSyncPath(d.watched_folder_path || ''))
      .catch(() => {})
  }, [apiUrl])

  const resetValidation = () => {
    setPendingFile(null)
    setValidation(null)
    setError('')
  }

  const validateFile = async (file) => {
    if (!file?.name?.endsWith('.xlsx')) {
      setError('Please choose an Excel (.xlsx) file')
      return
    }
    setError('')
    setValidating(true)
    setValidation(null)
    setPendingFile(file)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${apiUrl}/validate`, { method: 'POST', body: form })
      if (!res.ok) throw new Error('Validation failed')
      const data = await res.json()
      setValidation(data)
    } catch {
      setError('Could not validate file. Make sure the server is running.')
      setPendingFile(null)
    } finally {
      setValidating(false)
    }
  }

  const runMrp = async () => {
    if (!pendingFile || !validation?.ready_to_process) return
    setError('')
    setProcessing(true)
    try {
      const form = new FormData()
      form.append('file', pendingFile)
      const res = await fetch(`${apiUrl}/upload`, { method: 'POST', body: form })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const msgs = body?.detail?.errors || [body?.detail || 'Upload failed']
        setError(Array.isArray(msgs) ? msgs.join(' ') : String(msgs))
        return
      }
      const data = await res.json()
      resetValidation()
      onSuccess(data)
    } catch {
      setError('Could not upload. Make sure the server is running.')
    } finally {
      setProcessing(false)
    }
  }

  const openFolder = async () => {
    try {
      await fetch(`${apiUrl}/sync/open-folder`, { method: 'POST' })
    } catch {
      setError('Could not open folder.')
    }
  }

  const fieldLabel = (field) => field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  if (successData) {
    return (
      <div className="upload-page upload-page-centered">
        <div className="card success-card wide">
          <div className="success-check">✓</div>
          <h2>File ready</h2>
          <p>{successData.filename || 'Your planning file'} has been processed successfully.</p>
          <div className="success-stats">
            <div><strong>{successData.items_loaded}</strong> items</div>
            <div><strong>{successData.pos_found}</strong> orders</div>
            <div><strong>{successData.stockout_risks_detected}</strong> alerts</div>
          </div>
          <div className="success-actions">
            <button className="btn-primary" onClick={onGoOverview}>Go to Overview</button>
            <button className="btn-secondary" onClick={onClearSuccess}>Upload another file</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="upload-page">
      {validating || processing || loadingSample ? (
        <Spinner label={validating ? 'Analyzing your file…' : loadingSample ? 'Loading sample data…' : 'Running MRP…'} />
      ) : (
        <div className="upload-sections">
          <div className="card upload-section">
            <h3>Manual upload</h3>
            <p className="section-desc">Upload an Excel file directly from your computer</p>
            <div
              className={`drop-zone ${dragging ? 'dragging' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); e.dataTransfer.files[0] && validateFile(e.dataTransfer.files[0]) }}
              onClick={() => inputRef.current?.click()}
            >
              <UploadIcon />
              <p>Drop file here or click to browse</p>
              <input ref={inputRef} type="file" accept=".xlsx" hidden onChange={(e) => e.target.files[0] && validateFile(e.target.files[0])} />
            </div>

            {!validation && (
              <div className="sample-data-row">
                <span className="sample-data-divider">or</span>
                <button className="btn-secondary sample-data-btn" onClick={loadSample}>
                  Load sample data
                </button>
                <span className="sample-data-hint">Skip the upload and load a demo dataset instantly</span>
              </div>
            )}

            {validation && (
              <div className="validation-preview">
                <h4>We found the following sheets in your file:</h4>
                <ul className="validation-sheets">
                  {validation.sheets.map((s) => (
                    <li key={s.role} className={s.found ? 'found' : 'missing'}>
                      <span className="validation-icon">{s.found ? '✅' : '❌'}</span>
                      <span>
                        {s.label}
                        {s.found
                          ? ` → sheet '${s.sheet_name}' (${s.row_count} rows)`
                          : ' — not detected'}
                      </span>
                    </li>
                  ))}
                </ul>

                {validation.sheets.filter((s) => s.found && s.fields?.length > 0).map((s) => (
                  <div key={`map-${s.role}`} className="validation-sheet-columns">
                    <h4>{s.label} — columns mapped:</h4>
                    <ul className="validation-columns">
                      {s.fields.map((f) => (
                        <li key={`${s.role}-${f.field}`} className={f.found ? 'found' : (f.required ? 'missing' : 'optional')}>
                          {f.found ? (
                            <span>{f.label} → found as '{f.source_column}' ✅</span>
                          ) : f.required ? (
                            <span>
                              {f.label} → NOT FOUND ❌{' '}
                              <span className="available-cols">(columns in this sheet: {(s.available_columns || []).join(', ')})</span>
                            </span>
                          ) : (
                            <span className="optional-field">{f.label} → not provided (optional)</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}

                {validation.errors?.length > 0 && (
                  <div className="validation-errors">
                    {validation.errors.map((msg, i) => (
                      <p key={i} className="error-msg">{msg}</p>
                    ))}
                  </div>
                )}

                <div className="validation-actions">
                  {validation.ready_to_process ? (
                    <button className="btn-primary" onClick={runMrp}>
                      Run MRP
                    </button>
                  ) : (
                    <p className="validation-blocked">Fix the issues above before running MRP.</p>
                  )}
                  <button className="btn-secondary" onClick={resetValidation}>Choose a different file</button>
                </div>
              </div>
            )}

            {error && !validation && <p className="error-msg">{error}</p>}
            {error && validation && <p className="error-msg">{error}</p>}
          </div>

          <div className="card upload-section">
            <h3>Auto-sync mode</h3>
            <p className="section-desc">Copy your Excel file to the watched_files folder and any changes will reflect instantly in the app</p>
            <div className="sync-folder-info">
              <code className="folder-path">{syncPath || '…/watched_files'}</code>
              <button className="btn-secondary" onClick={openFolder}>Open watched folder</button>
            </div>
            <p className="sync-hint">Save or copy your ERP export to this folder. Changes are detected automatically and MRP recalculates in real time.</p>
          </div>
        </div>
      )}
    </div>
  )
}


function scenarioMetric(row, field) {
  if (!row) return 0
  if (field === 'demand') return row.demand ?? row.gross_req ?? 0
  if (field === 'stock') return row.stock ?? row.projected_inventory ?? 0
  return row.planned_order ?? 0
}

function ScenarioPlanningPanel({ apiUrl, itemId, itemName }) {
  const [open, setOpen] = useState(false)
  const [demandPct, setDemandPct] = useState(0)
  const [leadTimeDelta, setLeadTimeDelta] = useState(0)
  const [safetyStockPct, setSafetyStockPct] = useState(0)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const runScenario = async () => {
    if (!itemId || loading) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${apiUrl}/scenario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: itemId,
          demand_pct: demandPct,
          lead_time_delta: leadTimeDelta,
          safety_stock_pct: safetyStockPct,
        }),
      })
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      const data = await res.json()
      console.log('[scenario] response from /scenario:', data)
      setResult(data)
    } catch {
      setError('Could not run scenario. Make sure the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  const compareRows = result
    ? WEEKS.map((w) => {
        const current = result.current.find((r) => r.week === w) || {}
        const scenario = result.scenario.find((r) => r.week === w) || {}
        return { week: w, current, scenario }
      })
    : []

  const riskBefore = result?.impact?.stockout_risk_before ?? 0
  const riskAfter = result?.impact?.stockout_risk_after ?? 0
  const riskDelta = result?.impact?.stockout_risk_change ?? (riskAfter - riskBefore)
  const additionalOrders = result?.impact?.additional_orders ?? result?.impact?.additional_planned_orders ?? 0
  const additionalCost = result?.impact?.additional_cost ?? 0
  const impactWorse = riskDelta > 0 || additionalOrders > 0
  const impactBetter = riskDelta < 0 && additionalOrders === 0

  return (
    <div className="card scenario-panel">
      <button type="button" className="scenario-panel-toggle" onClick={() => setOpen(!open)}>
        <span>Scenario Planning</span>
        <span className="scenario-chevron">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="scenario-panel-body">
          <p className="scenario-hint">Simulate parameter changes for <strong>{itemName}</strong>. Does not overwrite your main plan.</p>

          <div className="scenario-controls">
            <label className="scenario-control">
              <span>Demand change: <strong>{demandPct > 0 ? '+' : ''}{demandPct}%</strong></span>
              <input type="range" min={-50} max={50} step={5} value={demandPct} onChange={(e) => setDemandPct(Number(e.target.value))} />
            </label>
            <label className="scenario-control">
              <span>Lead time delay: <strong>+{leadTimeDelta} wk</strong></span>
              <input type="range" min={0} max={4} step={1} value={leadTimeDelta} onChange={(e) => setLeadTimeDelta(Number(e.target.value))} />
            </label>
            <label className="scenario-control">
              <span>Safety stock change: <strong>{safetyStockPct > 0 ? '+' : ''}{safetyStockPct}%</strong></span>
              <input type="range" min={-50} max={50} step={5} value={safetyStockPct} onChange={(e) => setSafetyStockPct(Number(e.target.value))} />
            </label>
          </div>

          <button className="btn-primary scenario-run-btn" onClick={runScenario} disabled={loading}>
            {loading ? 'Running…' : 'Run Scenario'}
          </button>

          {error && <div className="sql-error">{error}</div>}

          {result && (
            <>
              <div className={`scenario-impact ${impactWorse ? 'scenario-impact-worse' : impactBetter ? 'scenario-impact-better' : ''}`}>
                <div className="scenario-impact-item">
                  Stockout risk: {riskBefore} → {riskAfter} items
                  {riskDelta !== 0 && (
                    <span className={riskDelta > 0 ? 'impact-bad' : 'impact-good'}>
                      ({riskDelta > 0 ? '+' : ''}{riskDelta})
                    </span>
                  )}
                </div>
                <div className="scenario-impact-item">
                  Additional orders needed: {additionalOrders}
                </div>
                <div className="scenario-impact-item">
                  Additional cost: ${additionalCost.toLocaleString()}
                </div>
              </div>

              <div className="table-scroll">
                <table className="data-table scenario-compare-table">
                  <thead>
                    <tr>
                      <th rowSpan={2}>Week</th>
                      <th colSpan={3} className="scenario-col-current">Current Plan</th>
                      <th colSpan={3} className="scenario-col-scenario">Scenario Result</th>
                    </tr>
                    <tr>
                      <th className="scenario-col-current">Demand</th>
                      <th className="scenario-col-current">Stock</th>
                      <th className="scenario-col-current">To Order</th>
                      <th className="scenario-col-scenario">Demand</th>
                      <th className="scenario-col-scenario">Stock</th>
                      <th className="scenario-col-scenario">To Order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareRows.map(({ week, current, scenario }) => {
                      const curDemand = scenarioMetric(current, 'demand')
                      const curStock = scenarioMetric(current, 'stock')
                      const curOrder = scenarioMetric(current, 'planned_order')
                      const scnDemand = scenarioMetric(scenario, 'demand')
                      const scnStock = scenarioMetric(scenario, 'stock')
                      const scnOrder = scenarioMetric(scenario, 'planned_order')
                      const demandClass = scnDemand > curDemand ? 'cell-scenario-demand-up' : ''
                      const orderClass = scnOrder > curOrder ? 'cell-scenario-order-up' : ''
                      const stockClass = scnStock !== curStock && !demandClass && !orderClass ? 'cell-changed' : ''
                      return (
                        <tr key={week}>
                          <td>{weekLabel(week)}</td>
                          <td>{Math.round(curDemand)}</td>
                          <td>{Math.round(curStock)}</td>
                          <td>{Math.round(curOrder)}</td>
                          <td className={demandClass}>{Math.round(scnDemand)}</td>
                          <td className={stockClass}>{Math.round(scnStock)}</td>
                          <td className={orderClass}>{Math.round(scnOrder)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}


function PlanningViewPage({
  item,
  items,
  mrpResults,
  openPos,
  summary,
  hasData,
  onUpload,
  selectedItemId,
  apiUrl,
  onOpenDrilldown,
  onAskAI,
}) {
  const [activePopover, setActivePopover] = useState(null)
  const itemMap = Object.fromEntries(items.map((i) => [i.item_id, i.item_name]))
  const itemById = Object.fromEntries(items.map((i) => [i.item_id, i]))

  const handlePopoverToggle = (cellKey, event, content) => {
    if (activePopover?.key === cellKey) {
      setActivePopover(null)
      return
    }
    setActivePopover({
      key: cellKey,
      rect: event.currentTarget.getBoundingClientRect(),
      content,
    })
  }

  const closePopover = () => setActivePopover(null)

  const openMetric = (metric, row, weeklyRows, weekIdx, rowItem, e) => {
    const content = buildPlanningMetricExplanation(metric, row, weeklyRows, weekIdx, rowItem)
    if (content && onOpenDrilldown) onOpenDrilldown(content, e)
  }

  const getWeeklyRowsForItem = (itemId, rowItem) => {
    const itemRows = mrpResults.filter((r) => r.item_id === itemId)
    return WEEKS.map((w) => {
      const found = itemRows.find((r) => r.week === w)
      return found || {
        item_id: itemId,
        week: w,
        gross_req: 0,
        scheduled_receipts: 0,
        projected_inventory: 0,
        net_req: 0,
        planned_order: 0,
        safety_stock: rowItem?.safety_stock ?? 0,
        stockout_risk: 0,
        need_date: null,
        release_date: null,
      }
    })
  }

  const renderPlanningRow = (r, wi, rowItem, weeklyRows, key, showItem = false) => {
    const st = weekStatus(r)
    const rowKey = String(key)
    const category = getItemCategory(rowItem)
    const orderType = getOrderTypeInfo(category)
    const releaseDisplay = formatReleaseDisplay(category, r)
    return (
      <tr key={key} className={getPlanningRowClass(st)}>
        {showItem && <td>{itemMap[r.item_id] || r.item_id}</td>}
        <td>{weekLabel(r.week)}</td>
        <td>{r.need_date ? fmtPlanDate(r.need_date) : '—'}</td>
        <PlanningValueCell
          value={Math.round(r.gross_req)}
          cellKey={`${rowKey}-demand`}
          isOpen={activePopover?.key === `${rowKey}-demand`}
          onToggle={handlePopoverToggle}
          popoverContent={buildPlanningPopoverContent('demand', r, weeklyRows, wi, rowItem)}
        />
        <td>{Math.round(r.scheduled_receipts)}</td>
        <PlanningValueCell
          value={Math.round(r.projected_inventory)}
          cellKey={`${rowKey}-stock`}
          isOpen={activePopover?.key === `${rowKey}-stock`}
          onToggle={handlePopoverToggle}
          popoverContent={buildPlanningPopoverContent('stock', r, weeklyRows, wi, rowItem)}
        />
        <PlanningValueCell
          value={Math.round(r.planned_order)}
          className={r.planned_order > 0 ? 'cell-to-order' : ''}
          cellKey={`${rowKey}-to_order`}
          isOpen={activePopover?.key === `${rowKey}-to_order`}
          onToggle={handlePopoverToggle}
          popoverContent={buildPlanningPopoverContent('to_order', r, weeklyRows, wi, rowItem)}
        />
        <td>
          <span className={`order-type-badge ${orderType.badgeClass}`}>{orderType.label}</span>
        </td>
        <PlanningValueCell
          value={releaseDisplay.text}
          cellKey={`${rowKey}-release_by`}
          isOpen={activePopover?.key === `${rowKey}-release_by`}
          onToggle={handlePopoverToggle}
          popoverContent={buildPlanningPopoverContent('release_by', r, weeklyRows, wi, rowItem)}
        >
          <span title={releaseDisplay.title}>{releaseDisplay.text}</span>
        </PlanningValueCell>
        <PlanningValueCell
          cellKey={`${rowKey}-status`}
          isOpen={activePopover?.key === `${rowKey}-status`}
          onToggle={handlePopoverToggle}
          popoverContent={buildPlanningPopoverContent('status', r, weeklyRows, wi, rowItem)}
        >
          <span className={`status-pill ${st.cls}`}>{st.label}</span>
        </PlanningValueCell>
      </tr>
    )
  }

  if (!hasData) return <EmptyState onUpload={onUpload} />

  const viewingLabel = item
    ? `Viewing: ${item.item_name} (${item.item_id})`
    : 'All Items'

  if (selectedItemId && item) {
    const itemRows = mrpResults.filter((r) => r.item_id === item.item_id)
    const weeklyRows = WEEKS.map((w) => {
      const found = itemRows.find((r) => r.week === w)
      return found || {
        item_id: item.item_id,
        week: w,
        gross_req: 0,
        scheduled_receipts: 0,
        projected_inventory: 0,
        net_req: 0,
        planned_order: 0,
        safety_stock: item.safety_stock ?? 0,
        stockout_risk: 0,
        need_date: null,
        release_date: null,
      }
    })
    const w1 = weeklyRows.find((r) => r.week === 'W1') || {}
    const itemPos = openPos.filter((p) => p.item_id === item.item_id)
    const itemCategory = getItemCategory(item)
    const w1Action = (w1.net_req || 0) > 0 || (w1.planned_order || 0) > 0
    const w1Explanation = buildW1ActionExplanation(w1, item, weeklyRows)
    const availableStock = Math.round(item.available_qty ?? 0)

    const supplyDemandData = WEEKS.map((w, i) => {
      const row = weeklyRows.find((r) => r.week === w) || {}
      return {
        week: WEEK_LABELS[i],
        Demand: row.gross_req || 0,
        Stock: row.projected_inventory || 0,
      }
    })

    return (
      <div className="planning-page">
        <PlanningCalcPopover
          popover={activePopover}
          onClose={closePopover}
          onAskAI={onAskAI}
        />
        <div className="planning-viewing-header">{viewingLabel}</div>

        <div className="card item-header-card">
          <div className="item-badges item-badges-prominent">
            <span className="info-badge">
              <strong>{item.item_name}</strong> · {item.item_id}
              <span className={`category-badge ${getCategoryBadgeClass(itemCategory)}`}>{itemCategory}</span>
            </span>
            <span className="info-badge">Lead time: {item.lead_time_weeks} wk</span>
            <span className="info-badge">Safety stock: {item.safety_stock}</span>
            <span className="info-badge">Lot size: {item.lot_size}</span>
            <span className="info-badge">Unit cost: ${item.unit_cost?.toFixed(2)}</span>
          </div>
        </div>

        <div className={`action-card ${w1Action ? 'action-card-alert' : 'action-card-healthy'}`}>
          <div className="action-card-grid">
            <div>
              <span className="action-label">Demand W1</span>
              <ClickableValue
                className="action-value"
                onDrillDown={(e) => openMetric('gross_req', w1, weeklyRows, 0, item, e)}
              >
                {w1.gross_req ?? 0}
              </ClickableValue>
            </div>
            <div>
              <span className="action-label">Available stock</span>
              <ClickableValue
                className="action-value"
                onDrillDown={(e) => openMetric('available_qty', w1, weeklyRows, 0, item, e)}
              >
                {availableStock}
              </ClickableValue>
            </div>
            <div>
              <span className="action-label">{getActionQtyLabel(itemCategory)}</span>
              <ClickableValue
                className="action-value"
                onDrillDown={(e) => openMetric('planned_order', w1, weeklyRows, 0, item, e)}
              >
                {w1.planned_order ?? 0}
              </ClickableValue>
            </div>
            <div>
              <span className="action-label">{getReleaseDateLabel(itemCategory)}</span>
              <ClickableValue
                className="action-value"
                onDrillDown={(e) => openMetric('release_date', w1, weeklyRows, 0, item, e)}
              >
                {w1.release_date ? fmtPlanDate(w1.release_date) : '—'}
              </ClickableValue>
              {w1.release_date && (
                <span className="action-date-hint" title={formatReleaseDisplay(itemCategory, w1).title}>
                  {itemCategory === 'Finished Good'
                    ? `Production start: ${fmtPlanDateShort(w1.release_date)}`
                    : `Arrive by ${fmtPlanDateShort(w1.need_date)} · PO by ${fmtPlanDateShort(w1.release_date)}`}
                </span>
              )}
            </div>
          </div>
          <p className="action-status-line">
            {w1Action
              ? getActionRequiredLine(itemCategory, w1)
              : 'No action required this week'}
          </p>
          {w1Explanation && (
            <p className="action-explanation" title={w1Explanation}>
              {w1Explanation}
            </p>
          )}
        </div>

        <div className="card table-card card-info">
          <div className="card-header">
            <h3>Weekly planning</h3>
            <p>Click any value to see how it was calculated</p>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Week</th>
                  <th>Need Date</th>
                  <th>Demand</th>
                  <th>Incoming</th>
                  <th>Stock</th>
                  <th>Action Qty</th>
                  <th>Order Type</th>
                  <th>Release By</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {weeklyRows.map((r, wi) => renderPlanningRow(r, wi, item, weeklyRows, r.week))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Open purchase orders</h3>
          </div>
          {itemPos.length === 0 ? (
            <p className="empty-inline">No open purchase orders for this item</p>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>PO Number</th>
                    <th>Supplier</th>
                    <th>Quantity</th>
                    <th>Arriving week</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {itemPos.map((po) => (
                    <tr key={po.po_number}>
                      <td>{po.po_number}</td>
                      <td>{po.supplier}</td>
                      <td>{Math.round(po.order_qty)}</td>
                      <td>{weekLabel(po.expected_receipt_week)}</td>
                      <td>{po.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Supply vs demand — {item.item_name}</h3>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={supplyDemandData}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="week" {...AXIS_STYLE} />
              <YAxis {...AXIS_STYLE} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Demand" fill={CHART_BLUE} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Stock" fill={CHART_GREEN} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <ScenarioPlanningPanel apiUrl={apiUrl} itemId={item.item_id} itemName={item.item_name} />
      </div>
    )
  }

  const coverage = summary?.supply_coverage || []

  return (
    <div className="planning-page">
      <PlanningCalcPopover
        popover={activePopover}
        onClose={closePopover}
        onAskAI={onAskAI}
      />
      <div className="planning-viewing-header">{viewingLabel}</div>

      <p className="planning-category-note">
        Finished goods show production orders. Sub-assemblies show work orders. Raw materials show purchase orders.
      </p>

      <div className="toolbar">
        <button className="btn-secondary" onClick={() => exportCSV(mrpResults, items)}>Export CSV</button>
      </div>

      <div className="card table-card card-info">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Week</th>
                <th>Need Date</th>
                <th>Demand</th>
                <th>Incoming</th>
                <th>Stock</th>
                <th>Action Qty</th>
                <th>Order Type</th>
                <th>Release By</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {mrpResults.length === 0 ? (
                <tr><td colSpan={10} className="empty-inline">No planning rows to display</td></tr>
              ) : mrpResults.map((r, i) => {
                const rowItem = itemById[r.item_id]
                const weeklyRows = getWeeklyRowsForItem(r.item_id, rowItem)
                const wi = WEEKS.indexOf(r.week)
                return renderPlanningRow(r, wi, rowItem, weeklyRows, i, true)
              })}
            </tbody>
          </table>
        </div>
      </div>

      <SupplyCoverageHeatmap coverage={coverage} itemMap={itemMap} />
    </div>
  )
}

function buildOverviewBarData(mrpResults) {
  return WEEKS.map((w, i) => {
    const weekRows = mrpResults.filter((r) => r.week === w)
    return {
      week: WEEK_LABELS[i],
      Demand: weekRows.reduce((s, r) => s + (r.gross_req || 0), 0),
      'Planned orders': weekRows.reduce((s, r) => s + (r.planned_order || 0), 0),
    }
  })
}

function buildOverviewInventoryLine(mrpResults) {
  return WEEKS.map((w, i) => {
    const weekRows = mrpResults.filter((r) => r.week === w)
    return {
      week: WEEK_LABELS[i],
      'Projected inventory': weekRows.reduce((s, r) => s + (r.projected_inventory || 0), 0),
    }
  })
}

function SupplyCoverageHeatmap({ coverage, itemMap }) {
  return (
  <div className="card">
    <div className="card-header">
      <h3>Supply coverage</h3>
      <p>How well stocked each item is across the next 8 weeks</p>
    </div>
    <div className="heatmap-scroll">
      <table className="heatmap-table">
        <thead>
          <tr>
            <th>Item</th>
            {WEEK_LABELS.map((w) => <th key={w}>{w}</th>)}
          </tr>
        </thead>
        <tbody>
          {coverage.map((row) => (
            <tr key={row.item_id}>
              <td className="heatmap-name">{itemMap[row.item_id] || row.item_id}</td>
              {WEEKS.map((w) => {
                const cell = row.weeks[w]
                if (!cell) return <td key={w} className="heatmap-cell">—</td>
                const cls = cell.status === 'green' ? 'healthy' : cell.status === 'amber' ? 'low' : 'risk'
                return (
                  <td key={w} className={`heatmap-cell cell-${cls}`} title={`Stock: ${Math.round(cell.projected_inventory)}`}>
                    {Math.round(cell.projected_inventory)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div className="heatmap-legend">
      <span><i className="dot healthy" /> Healthy</span>
      <span><i className="dot low" /> Low stock</span>
      <span><i className="dot risk" /> Stockout risk</span>
    </div>
  </div>
  )
}

function ForecastPage({
  apiUrl,
  items,
  mrpResults,
  hasData,
  onUpload,
  onApplied,
  onGoPlanning,
  forecastStatus,
}) {
  const finishedGoods = items.filter((i) => getItemCategory(i) === 'Finished Good')
  const [itemId, setItemId] = useState(finishedGoods[0]?.item_id || '')
  const [method, setMethod] = useState('exponential_smoothing')
  const [params, setParams] = useState({
    ma_window: 3,
    alpha: 0.3,
    beta: 0.1,
    trend: 'add',
    seasonal: 'add',
    seasonal_periods: 4,
  })
  const [result, setResult] = useState(null)
  const [overrides, setOverrides] = useState({})
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [hasHistory, setHasHistory] = useState(forecastStatus?.has_sales_history ?? null)

  useEffect(() => {
    if (!itemId && finishedGoods[0]) setItemId(finishedGoods[0].item_id)
  }, [finishedGoods, itemId])

  useEffect(() => {
    if (!hasData) return undefined
    fetch(`${apiUrl}/forecast/status`)
      .then((r) => r.json())
      .then((d) => setHasHistory(!!d.has_sales_history))
      .catch(() => setHasHistory(false))
  }, [apiUrl, hasData])

  if (!hasData) return <EmptyState onUpload={onUpload} />

  const selected = items.find((i) => i.item_id === itemId)
  const currentDemand = WEEKS.map((w) => {
    const row = mrpResults.find((r) => r.item_id === itemId && r.week === w)
    return Math.round(row?.gross_req || 0)
  })

  const methods = [
    {
      id: 'moving_average',
      title: 'Moving Average',
      best: 'Best for: stable demand',
      sap: 'SAP equivalent: none',
    },
    {
      id: 'exponential_smoothing',
      title: 'Exponential Smoothing',
      best: 'Best for: recent trends',
      sap: 'SAP equivalent: Standard',
    },
    {
      id: 'double_exponential',
      title: "Holt's Double",
      best: 'Best for: trending items',
      sap: 'SAP equivalent: Trend',
    },
    {
      id: 'holt_winters',
      title: 'Holt-Winters',
      best: 'Best for: seasonal items',
      sap: 'SAP equivalent: Seasonal',
    },
  ]

  const generate = async () => {
    if (!itemId) return
    setLoading(true)
    setError('')
    setToast('')
    try {
      const res = await fetch(`${apiUrl}/forecast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, method, periods: 8, params }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Forecast failed')
      setResult(data)
      setOverrides({})
    } catch (e) {
      setError(e.message || 'Forecast failed')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const finalValues = () => {
    if (!result) return []
    return result.forecast.map((f) => {
      const ov = overrides[f.week]
      return ov !== undefined && ov !== '' ? Number(ov) : f.forecast
    })
  }

  const applyToMrp = async () => {
    if (!result) return
    setApplying(true)
    setError('')
    try {
      const res = await fetch(`${apiUrl}/forecast/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: itemId,
          forecast_values: finalValues(),
          method,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Apply failed')
      setToast('Forecast applied — MRP recalculated with new demand plan')
      await onApplied?.(data)
      setTimeout(() => onGoPlanning?.(), 900)
    } catch (e) {
      setError(e.message || 'Apply failed')
    } finally {
      setApplying(false)
    }
  }

  const chartData = (() => {
    if (!result) return []
    const hist = result.historical.map((h) => ({
      week: h.week,
      actual: h.actual,
      forecast: null,
      lower: null,
      upper: null,
    }))
    const fc = result.forecast.map((f) => {
      const ov = overrides[f.week]
      const final = ov !== undefined && ov !== '' ? Number(ov) : f.forecast
      return {
        week: f.week,
        actual: null,
        forecast: final,
        lower: f.lower,
        upper: f.upper,
      }
    })
    return [...hist, ...fc]
  })()

  const mapeClass = (m) => (m < 15 ? 'metric-good' : m <= 25 ? 'metric-warn' : 'metric-bad')
  const biasClass = (b) => (Math.abs(b) <= 2 ? 'metric-good' : Math.abs(b) <= 5 ? 'metric-warn' : 'metric-bad')

  const accuracyBlurb = (acc) => {
    if (!acc) return ''
    const quality = acc.mape < 15 ? 'this is good' : acc.mape <= 25 ? 'this is acceptable' : 'consider tuning parameters'
    const biasNote = acc.bias > 0.5
      ? 'Slight positive bias means you tend to over-forecast slightly.'
      : acc.bias < -0.5
        ? 'Slight negative bias means you tend to under-forecast slightly.'
        : 'Bias is near zero — forecasts are well centered.'
    return `Your forecast is ${acc.mape}% off on average — ${quality}. ${biasNote}`
  }

  if (hasHistory === false) {
    return (
      <div className="forecast-page">
        <div className="card forecast-empty-card">
          <h3>No historical data found</h3>
          <p>
            Add a <strong>Sales_History</strong> sheet to your Excel file with columns:
            Item_ID, W-1, W-2, W-3 … W-16 (past 16 weeks of actual sales).
          </p>
          <p className="muted">Then re-upload the file or load the updated sample data.</p>
          <button type="button" className="btn-primary" onClick={onUpload}>
            Go to Upload
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="forecast-page">
      {toast && <div className="forecast-toast">{toast}</div>}
      {error && <p className="error-msg">{error}</p>}

      <div className="forecast-top-grid">
        <div className="card">
          <div className="card-header">
            <h3>Select Item</h3>
            <p>Finished goods only — forecasts feed MRP demand</p>
          </div>
          <select
            className="forecast-item-select"
            value={itemId}
            onChange={(e) => {
              setItemId(e.target.value)
              setResult(null)
              setOverrides({})
            }}
          >
            {finishedGoods.length === 0 && <option value="">No finished goods</option>}
            {finishedGoods.map((i) => (
              <option key={i.item_id} value={i.item_id}>
                {i.item_name} ({i.item_id})
              </option>
            ))}
          </select>
          {selected && (
            <div className="forecast-item-meta">
              <span className={`category-badge ${getCategoryBadgeClass(getItemCategory(selected))}`}>
                {getItemCategory(selected)}
              </span>
              <span className="muted">
                Current W1–W8 demand: {currentDemand.join(', ')}
              </span>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Forecasting Method</h3>
            <p>Choose a statistical method, then generate</p>
          </div>
          <div className="forecast-method-grid">
            {methods.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`forecast-method-card${method === m.id ? ' selected' : ''}`}
                onClick={() => setMethod(m.id)}
              >
                <strong>{m.title}</strong>
                <span>{m.best}</span>
                <span className="muted">{m.sap}</span>
              </button>
            ))}
          </div>

          <div className="forecast-params">
            {method === 'moving_average' && (
              <label>
                Window: {params.ma_window} weeks
                <input
                  type="range" min="2" max="8" value={params.ma_window}
                  onChange={(e) => setParams({ ...params, ma_window: Number(e.target.value) })}
                />
              </label>
            )}
            {(method === 'exponential_smoothing' || method === 'double_exponential' || method === 'holt_winters') && (
              <label>
                Alpha (smoothing): {params.alpha.toFixed(1)}
                <input
                  type="range" min="0.1" max="0.9" step="0.1" value={params.alpha}
                  onChange={(e) => setParams({ ...params, alpha: Number(e.target.value) })}
                />
                <span className="muted">Higher = more weight on recent data</span>
              </label>
            )}
            {method === 'double_exponential' && (
              <label>
                Beta (trend): {params.beta.toFixed(1)}
                <input
                  type="range" min="0.1" max="0.9" step="0.1" value={params.beta}
                  onChange={(e) => setParams({ ...params, beta: Number(e.target.value) })}
                />
              </label>
            )}
            {method === 'holt_winters' && (
              <label>
                Seasonal periods
                <select
                  value={params.seasonal_periods}
                  onChange={(e) => setParams({ ...params, seasonal_periods: Number(e.target.value) })}
                >
                  <option value={4}>4 (quarterly pattern)</option>
                  <option value={12}>12 (monthly pattern)</option>
                </select>
              </label>
            )}
          </div>

          <button type="button" className="btn-primary" onClick={generate} disabled={loading || !itemId}>
            {loading ? 'Generating…' : 'Generate Forecast'}
          </button>
        </div>
      </div>

      {result && (
        <>
          <div className="card">
            <div className="card-header">
              <h3>Historical vs Forecast — {result.item_name}</h3>
              <p><span className="muted">Historical</span> · <span style={{ color: '#0071e3' }}>Forecast</span></p>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={chartData}>
                <CartesianGrid {...CHART_GRID} />
                <XAxis dataKey="week" {...AXIS_STYLE} interval="preserveStartEnd" />
                <YAxis {...AXIS_STYLE} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="upper" stroke="none" fill="#0071e3" fillOpacity={0.08} name="Upper bound" />
                <Area type="monotone" dataKey="lower" stroke="none" fill="#fff" fillOpacity={1} name="Lower bound" />
                <Line type="monotone" dataKey="actual" stroke="#86868b" strokeWidth={2} dot={false} name="Historical" connectNulls={false} />
                <Line type="monotone" dataKey="forecast" stroke="#0071e3" strokeWidth={2.5} dot={{ r: 3 }} name="Forecast" connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="forecast-metrics-row">
            <div className={`card forecast-metric ${mapeClass(result.accuracy.mape)}`}>
              <span className="forecast-metric-label">MAPE</span>
              <strong>{result.accuracy.mape}%</strong>
              <span className="muted">Mean Abs % Error</span>
            </div>
            <div className="card forecast-metric">
              <span className="forecast-metric-label">MAD</span>
              <strong>{result.accuracy.mad} units</strong>
              <span className="muted">Mean Abs Deviation</span>
            </div>
            <div className={`card forecast-metric ${biasClass(result.accuracy.bias)}`}>
              <span className="forecast-metric-label">Bias</span>
              <strong>{result.accuracy.bias > 0 ? '+' : ''}{result.accuracy.bias}</strong>
              <span className="muted">Over/Under forecast</span>
            </div>
          </div>
          <p className="forecast-blurb">{accuracyBlurb(result.accuracy)}</p>

          <div className="card table-card">
            <div className="card-header">
              <h3>Forecast table</h3>
              <p>Edit Override to adjust before applying to MRP</p>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Week</th>
                    <th>Statistical Forecast</th>
                    <th>Your Override</th>
                    <th>Final Forecast</th>
                  </tr>
                </thead>
                <tbody>
                  {result.forecast.map((f) => {
                    const ov = overrides[f.week]
                    const hasOv = ov !== undefined && ov !== ''
                    const final = hasOv ? Number(ov) : f.forecast
                    return (
                      <tr key={f.week}>
                        <td>{weekLabel(f.week)}</td>
                        <td>{f.forecast}</td>
                        <td>
                          <input
                            className={`forecast-override-input${hasOv ? ' overridden' : ''}`}
                            type="number"
                            placeholder="—"
                            value={hasOv ? ov : ''}
                            onChange={(e) => {
                              const v = e.target.value
                              setOverrides((prev) => {
                                const next = { ...prev }
                                if (v === '') delete next[f.week]
                                else next[f.week] = v
                                return next
                              })
                            }}
                          />
                        </td>
                        <td className={hasOv ? 'cell-override' : ''}>{final}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="forecast-actions">
            <button type="button" className="btn-primary" onClick={applyToMrp} disabled={applying}>
              {applying ? 'Applying…' : 'Apply to MRP'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setOverrides({})}
              disabled={Object.keys(overrides).length === 0}
            >
              Reset to Statistical
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function OverviewPage({ summary, mrpResults, items, openPos, hasData, onUpload, selectedItemId, onOpenDrilldown, lastUpdated, filename, forecastStatus, onDismissForecastBanner }) {
  if (!hasData) return <EmptyState onUpload={onUpload} />

  const filteredMrp = filterByItem(mrpResults, selectedItemId)
  const filteredPos = filterByItem(openPos, selectedItemId)
  const stockouts = filterByItem(summary?.stockout_risks || [], selectedItemId)
  const itemMap = Object.fromEntries(items.map((i) => [i.item_id, i.item_name]))
  const barData = buildOverviewBarData(filteredMrp)
  const inventoryLine = buildOverviewInventoryLine(filteredMrp)
  const ordersDueThisWeek = filteredPos.filter((p) => p.expected_receipt_week === 'W1').length

  const totalItems = selectedItemId ? 1 : summary.total_items
  const openPoCount = selectedItemId ? filteredPos.length : summary.open_pos_count

  const kpiContext = { summary, items, mrpResults, openPos, stockouts, selectedItemId, totalItems, openPoCount, ordersDueThisWeek }

  const openKpi = (key, e) => {
    const content = buildOverviewKpiExplanation(key, kpiContext)
    if (content && onOpenDrilldown) onOpenDrilldown(content, e)
  }

  const heroMeta = [
    lastUpdated ? formatLastUpdated(lastUpdated) : null,
    filename || null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="overview-page">
      {forecastStatus?.forecast_active && !forecastStatus?.bannerDismissed && (
        <div className="forecast-applied-banner">
          <span>
            Using AI forecast — demand plan generated by{' '}
            <strong>{(forecastStatus.method || 'forecast').replace(/_/g, ' ')}</strong> forecasting
            {forecastStatus.applied_at ? ` • Applied ${timeAgo(forecastStatus.applied_at)}` : ''}
          </span>
          <button type="button" className="forecast-banner-dismiss" onClick={onDismissForecastBanner} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      <div className="overview-hero">
        <div className="overview-hero-content">
          <h2>Supply Chain Status</h2>
          {heroMeta && <p className="overview-hero-meta">{heroMeta}</p>}
          <div className="overview-hero-kpis">
            <div className="overview-hero-kpi">
              <ClickableValue className="overview-hero-kpi-value" onDrillDown={(e) => openKpi('total_items', e)}>
                {totalItems}
              </ClickableValue>
              <span>{selectedItemId ? 'Item' : 'Total items'}</span>
            </div>
            <div className="overview-hero-kpi">
              <ClickableValue className="overview-hero-kpi-value" onDrillDown={(e) => openKpi('stockout_alerts', e)}>
                {stockouts.length}
              </ClickableValue>
              <span>Stockout alerts</span>
            </div>
            <div className="overview-hero-kpi">
              <ClickableValue className="overview-hero-kpi-value" onDrillDown={(e) => openKpi('open_orders', e)}>
                {openPoCount}
              </ClickableValue>
              <span>Open orders</span>
            </div>
            <div className="overview-hero-kpi">
              <ClickableValue className="overview-hero-kpi-value" onDrillDown={(e) => openKpi('orders_due', e)}>
                {ordersDueThisWeek}
              </ClickableValue>
              <span>Due this week</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card card-info">
        <div className="card-header">
          <h3>Demand vs planned orders</h3>
          <p>Weekly gross demand compared to planned order releases</p>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={barData}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis dataKey="week" {...AXIS_STYLE} />
            <YAxis {...AXIS_STYLE} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Demand" fill={CHART_BLUE} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Planned orders" fill={CHART_TEAL} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card card-info">
        <div className="card-header">
          <h3>Projected inventory</h3>
          <p>Expected stock levels across the planning horizon</p>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={inventoryLine}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis dataKey="week" {...AXIS_STYLE} />
            <YAxis {...AXIS_STYLE} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="Projected inventory" stroke={CHART_GREEN} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {stockouts.length > 0 && (
        <div className="card card-alert">
          <div className="card-header">
            <h3>Stockout alerts</h3>
            <p>Items that may run below safety stock</p>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Week</th>
                  <th>Projected stock</th>
                </tr>
              </thead>
              <tbody>
                {stockouts.map((s, i) => (
                  <tr key={i}>
                    <td>{itemMap[s.item_id] || s.item_id}</td>
                    <td>{weekLabel(s.week)}</td>
                    <td>
                      <ClickableValue
                        onDrillDown={(e) => {
                          const rowItem = items.find((it) => it.item_id === s.item_id)
                          const weeklyRows = WEEKS.map((w) => {
                            const found = mrpResults.find((r) => r.item_id === s.item_id && r.week === w)
                            return found || { item_id: s.item_id, week: w, gross_req: 0, scheduled_receipts: 0, projected_inventory: 0, net_req: 0, planned_order: 0, safety_stock: rowItem?.safety_stock ?? 0 }
                          })
                          const wi = WEEKS.indexOf(s.week)
                          const row = weeklyRows[wi] || s
                          const content = buildPlanningMetricExplanation('projected_inventory', row, weeklyRows, wi, rowItem)
                          if (content && onOpenDrilldown) onOpenDrilldown(content, e)
                        }}
                      >
                        {Math.round(s.projected_inventory)}
                      </ClickableValue>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function exportCSV(mrpResults, items) {
  const itemMap = Object.fromEntries(items.map((i) => [i.item_id, i.item_name]))
  const headers = ['Item', 'Week', 'Demand', 'Incoming orders', 'Stock level', 'Need to order', 'Orders to place', 'Safety stock', 'At risk']
  const rows = mrpResults.map((r) => [
    itemMap[r.item_id] || r.item_id,
    weekLabel(r.week),
    r.gross_req, r.scheduled_receipts, r.projected_inventory,
    r.net_req, r.planned_order, r.safety_stock,
    r.stockout_risk ? 'Yes' : 'No',
  ])
  const csv = [headers, ...rows].map((row) => row.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'requirements.csv'
  a.click()
}

function PurchaseOrdersPage({ openPos, items, hasData, onUpload, selectedItemId }) {
  const itemMap = Object.fromEntries(items.map((i) => [i.item_id, i.item_name]))
  const itemCostMap = Object.fromEntries(items.map((i) => [i.item_id, i.unit_cost || 0]))
  if (!hasData) return <EmptyState onUpload={onUpload} />

  const filteredPos = filterByItem(openPos, selectedItemId)
  const confirmed = filteredPos.filter((p) => /confirm/i.test(p.status || '')).length
  const inTransit = filteredPos.filter((p) => /transit/i.test(p.status || '')).length
  const pending = filteredPos.length - confirmed - inTransit
  const totalValue = filteredPos.reduce((sum, po) => sum + (po.order_qty || 0) * (itemCostMap[po.item_id] || 0), 0)
  const suppliers = [...new Set(filteredPos.map((p) => p.supplier))].slice(0, 3)
  const timelineData = WEEKS.map((w, i) => {
    const row = { week: WEEK_LABELS[i] }
    suppliers.forEach((s) => {
      row[s] = filteredPos
        .filter((p) => p.expected_receipt_week === w && p.supplier === s)
        .reduce((sum, p) => sum + p.order_qty, 0)
    })
    return row
  })

  const supplierColors = [CHART_BLUE, CHART_TEAL, CHART_GRAY]

  return (
    <div className="orders-page">
      {filteredPos.length === 0 ? (
        <div className="card"><p className="empty-inline">No open purchase orders{selectedItemId ? ' for this item' : ''}</p></div>
      ) : (
        <>
      <div className="orders-summary-bar">
        <span><strong>{confirmed}</strong> PO{confirmed !== 1 ? 's' : ''} confirmed</span>
        <span className="orders-summary-dot">·</span>
        <span><strong>{inTransit}</strong> in transit</span>
        <span className="orders-summary-dot">·</span>
        <span><strong>{pending}</strong> pending</span>
        <span className="orders-summary-dot">·</span>
        <span>Total value: <strong>${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
      </div>
      <div className="card card-info">
        <div className="card-header">
          <h3>Incoming deliveries</h3>
          <p>When purchase orders are expected to arrive, by supplier</p>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={timelineData}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis dataKey="week" {...AXIS_STYLE} />
            <YAxis {...AXIS_STYLE} />
            <Tooltip />
            <Legend />
            {suppliers.map((s, i) => (
              <Bar key={s} dataKey={s} stackId="a" fill={supplierColors[i]} radius={i === suppliers.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="orders-list">
        {filteredPos.map((po) => (
          <div key={po.po_number} className={`card order-card ${poStatusBorderClass(po.status)}`}>
            <div className="order-top">
              <div className="order-top-left">
                <span className="supplier-avatar" style={{ background: supplierColor(po.supplier) }}>
                  {supplierInitials(po.supplier)}
                </span>
                <div>
                  <span className="order-id">{po.po_number}</span>
                  <p className="order-supplier">{po.supplier}</p>
                </div>
              </div>
              <span className={`order-status status-${(po.status || '').toLowerCase().replace(/\s+/g, '-')}`}>{po.status || '—'}</span>
            </div>
            <p className="order-detail">{itemMap[po.item_id] || po.item_id} · {po.order_qty} units · {weekLabel(po.expected_receipt_week)}</p>
          </div>
        ))}
      </div>
        </>
      )}
    </div>
  )
}

function AssistantMessage({ content, chart }) {
  return (
    <div className="message assistant">
      <div className="markdown-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
      {chart && chart.data && chart.data.length > 0 && <ChatChart chart={chart} />}
    </div>
  )
}

function ChatHeatmap({ chart }) {
  const { data, xKey, yKeys } = chart
  const valueKey = yKeys?.[0] || 'value'
  const rows = [...new Set(data.map((d) => d.item || d.item_id || d.row || d.name))]
  const cols = [...new Set(data.map((d) => d[xKey]))]
  const lookup = Object.fromEntries(data.map((d) => [`${d.item || d.item_id || d.row || d.name}|${d[xKey]}`, d[valueKey]]))
  const vals = data.map((d) => Number(d[valueKey])).filter((v) => !Number.isNaN(v))
  const min = vals.length ? Math.min(...vals) : 0
  const max = vals.length ? Math.max(...vals) : 1

  const cellColor = (val) => {
    if (val === undefined || val === null) return '#f5f5f7'
    const t = max === min ? 0.5 : (Number(val) - min) / (max - min)
    const r = Math.round(255 - t * 180)
    const g = Math.round(235 - t * 80)
    const b = Math.round(247 - t * 60)
    return `rgb(${r},${g},${b})`
  }

  return (
    <div className="chat-heatmap-scroll">
      <table className="chat-heatmap-table">
        <thead>
          <tr>
            <th>Item</th>
            {cols.map((c) => <th key={c}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row}>
              <td className="chat-heatmap-row-label">{row}</td>
              {cols.map((col) => {
                const val = lookup[`${row}|${col}`]
                return (
                  <td key={col} className="chat-heatmap-cell" style={{ background: cellColor(val) }}>
                    {val !== undefined && val !== null ? Math.round(Number(val)) : '—'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ChatChart({ chart }) {
  const chartRef = useRef(null)
  const [downloading, setDownloading] = useState(false)
  const { type, title, subtitle, data } = chart

  const downloadPng = async () => {
    if (!chartRef.current || downloading) return
    setDownloading(true)
    try {
      const canvas = await html2canvas(chartRef.current, { backgroundColor: '#ffffff', scale: 2 })
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = `${(title || 'chart').replace(/\s+/g, '_').toLowerCase()}.png`
      a.click()
    } finally {
      setDownloading(false)
    }
  }

  const PIE_COLORS = ['#2a78d6', '#1baf7a', '#eda100', '#e34948', '#4a3aa7']

  const renderChart = () => {
    if (!data?.length) return <p className="chat-chart-empty">No chart data available</p>

    if (type === 'pie') {
      return (
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => name + ': ' + value}>
              {data.map((entry, index) => (
                <Cell key={index} fill={PIE_COLORS[index % 5]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )
    }

    if (type === 'line') {
      return (
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis dataKey="week" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="#2a78d6" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      )
    }

    if (type === 'heatmap') {
      return <ChatHeatmap chart={chart} />
    }

    return (
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data} margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="value" fill="#2a78d6" radius={[4, 4, 0, 0]} maxBarSize={50} />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  return (
    <div className="chat-chart-card">
      <div className="chat-chart-capture" ref={chartRef}>
        {title && <h4 className="chat-chart-title">{title}</h4>}
        {subtitle && <p className="chat-chart-subtitle">{subtitle}</p>}
        <div className="chat-chart-container">
          {renderChart()}
        </div>
      </div>
      <button className="btn-secondary chat-chart-download" onClick={downloadPng} disabled={downloading}>
        {downloading ? 'Saving…' : 'Download chart as PNG'}
      </button>
    </div>
  )
}

function AssistantPage({ hasData, apiUrl, onUpload, pendingMessage, onPendingMessageHandled }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const hasSentRef = useRef('')
  const sendMessageRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = useCallback(async (text) => {
    const msg = text.trim()
    if (!msg || loading) return
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: msg }])
    setLoading(true)
    try {
      const res = await fetch(`${apiUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      })
      const data = await res.json()
      console.log('[chat] response from /chat:', data)
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply, chart: data.chart || null }])
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Could not reach the assistant. Check your connection.', chart: null }])
    } finally {
      setLoading(false)
    }
  }, [apiUrl, loading])

  sendMessageRef.current = sendMessage

  useEffect(() => {
    const msg = pendingMessage?.trim()
    if (!msg || !hasData) return
    if (hasSentRef.current === msg) return
    hasSentRef.current = msg
    onPendingMessageHandled?.()
    sendMessageRef.current(msg)
  }, [pendingMessage, hasData, onPendingMessageHandled])

  useEffect(() => {
    if (!pendingMessage) {
      hasSentRef.current = ''
    }
  }, [pendingMessage])

  if (!hasData) return <EmptyState onUpload={onUpload} />

  return (
    <div className="assistant-page card card-info">
      {messages.length === 0 && !loading && (
        <div className="assistant-welcome">
          <div className="assistant-welcome-icon" aria-hidden>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><circle cx="9" cy="10" r="1" fill="currentColor" /><circle cx="15" cy="10" r="1" fill="currentColor" />
            </svg>
          </div>
          <h3>Ask me anything about your supply chain</h3>
          <p>Get instant answers on stockouts, POs, release dates, and supply chain health</p>
        </div>
      )}
      <div className="chips-section">
        <span className="chips-label">Generate a chart:</span>
        <div className="chips">
          {CHART_QUICK_QUESTIONS.map((q) => (
            <button key={q} className="chip chip-chart" onClick={() => sendMessage(q)} disabled={loading}>{q}</button>
          ))}
        </div>
      </div>
      <div className="chips-section">
        <span className="chips-label">Quick questions:</span>
        <div className="chips">
          {QUICK_QUESTIONS.map((q) => (
            <button key={q} className="chip" onClick={() => sendMessage(q)} disabled={loading}>{q}</button>
          ))}
        </div>
      </div>
      <div className="chat-messages">
        {messages.map((m, i) =>
          m.role === 'assistant' ? (
            <AssistantMessage key={i} content={m.content} chart={m.chart} />
          ) : (
            <div key={i} className="message user">{m.content}</div>
          )
        )}
        {loading && <div className="message assistant muted">Thinking…</div>}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input chat-input-prominent">
        <input
          value={input}
          placeholder="Ask a question about your supply plan…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage(input)}
          disabled={loading}
        />
        <button className="btn-primary" onClick={() => sendMessage(input)} disabled={loading || !input.trim()}>Send</button>
      </div>
    </div>
  )
}

const SQL_TABLES = [
  {
    name: 'mrp_results',
    accent: '#2a78d6',
    columns: ['item_id', 'item_name', 'week', 'gross_req', 'net_req', 'projected_inventory', 'planned_order', 'safety_stock', 'stockout_risk', 'need_date', 'release_date'],
  },
  {
    name: 'items',
    accent: '#1baf7a',
    columns: ['item_id', 'item_name', 'lead_time_weeks', 'safety_stock', 'lot_size', 'unit', 'unit_cost'],
  },
  {
    name: 'open_pos',
    accent: '#eda100',
    columns: ['po_number', 'item_id', 'supplier', 'order_qty', 'expected_receipt_week', 'status'],
  },
]

const SQL_EXAMPLES = [
  {
    label: 'POs to release this week',
    sql: "SELECT item_id, item_name, week, planned_order, net_req, release_date, need_date FROM mrp_results WHERE planned_order > 0 AND week = 'W1' ORDER BY planned_order DESC",
  },
  {
    label: 'Stockout risks',
    sql: 'SELECT item_id, item_name, week, projected_inventory, safety_stock FROM mrp_results WHERE stockout_risk = 1',
  },
  {
    label: 'All future releases',
    sql: 'SELECT item_id, item_name, week, planned_order, release_date, need_date FROM mrp_results WHERE planned_order > 0 ORDER BY week ASC',
  },
  {
    label: 'Supply gap analysis',
    sql: 'SELECT m.item_id, m.item_name, m.week, m.net_req, COALESCE(p.order_qty, 0) AS already_on_order, m.net_req - COALESCE(p.order_qty, 0) AS remaining_gap FROM mrp_results m LEFT JOIN open_pos p ON m.item_id = p.item_id AND m.week = p.expected_receipt_week WHERE m.net_req > 0 ORDER BY m.week ASC',
  },
  {
    label: 'Overdue releases',
    sql: 'SELECT item_id, item_name, release_date, need_date, planned_order FROM mrp_results WHERE is_overdue = 1 AND planned_order > 0 ORDER BY release_date ASC',
  },
  {
    label: 'PO summary by supplier',
    sql: 'SELECT supplier, COUNT(*) as po_count, SUM(order_qty) as total_qty FROM open_pos GROUP BY supplier ORDER BY total_qty DESC',
  },
]

function exportQueryCSV(columns, rows) {
  const escape = (v) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [columns, ...rows].map((row) => row.map(escape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'query-results.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}

async function downloadExport(apiUrl, endpoint, filename) {
  const res = await fetch(`${apiUrl}${endpoint}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Export failed (${res.status})`)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function ExportToast({ message }) {
  if (!message) return null
  return <div className="export-toast" role="status">{message}</div>
}

async function fetchMetabaseStatus(apiUrl) {
  try {
    const res = await fetch(`${apiUrl}/metabase-status`)
    if (!res.ok) return false
    const data = await res.json()
    return !!data.running
  } catch {
    return false
  }
}

function ExportDataSection({ apiUrl, hasData }) {
  const [loading, setLoading] = useState(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [metabaseRunning, setMetabaseRunning] = useState(false)
  const [metabaseChecking, setMetabaseChecking] = useState(true)
  const [metabaseUrl, setMetabaseUrl] = useState('http://localhost:3000')

  useEffect(() => {
    fetch(`${apiUrl}/metabase-config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.metabase_url) setMetabaseUrl(data.metabase_url)
      })
      .catch(() => {})
    fetchMetabaseStatus(apiUrl)
      .then((isRunning) => {
        setMetabaseRunning(isRunning)
        setMetabaseChecking(false)
      })
      .catch(() => setMetabaseChecking(false))
  }, [apiUrl])

  const handleCsvExport = async () => {
    if (!hasData || loading) return
    setError('')
    setLoading('csv')
    try {
      await downloadExport(apiUrl, '/export/csv', 'mrp_export_csv.zip')
    } catch (e) {
      setError(e?.message || 'Export failed')
    } finally {
      setLoading(null)
    }
  }

  const handleFabricExport = async () => {
    if (!hasData || loading) return
    setError('')
    setLoading('fabric')
    try {
      await downloadExport(apiUrl, '/export/powerbi', 'mrp_export_powerbi.zip')
      window.open('https://app.fabric.microsoft.com', '_blank', 'noopener')
      setToast('Data exported — upload the CSVs in Fabric to build your dashboards')
      setTimeout(() => setToast(''), 4500)
    } catch (e) {
      setError(e?.message || 'Export failed')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="export-section-wrap">
      <ExportToast message={toast} />
      {!hasData && (
        <p className="export-disabled-hint">Upload a file to enable exports</p>
      )}
      <div className="export-cards export-cards-two">
        <div className="export-card">
          <p className="export-card-label">Export Data</p>
          <h4>Download MRP Data</h4>
          <p>Download all MRP tables as a zip file — ready for Power BI, Fabric, Excel, or any BI tool</p>
          <button
            className="btn-primary export-btn"
            disabled={!hasData || loading !== null}
            onClick={handleCsvExport}
          >
            {loading === 'csv' ? 'Downloading…' : 'Download CSV Export'}
          </button>
          <p className="export-card-hint">Includes mrp_results, items, and open_pos as CSV files</p>
        </div>

        <div className="export-card">
          <p className="export-card-label">Open in BI Tool</p>
          <h4>Analyze in Microsoft Fabric</h4>
          <p>Export data and open Fabric to build custom dashboards — free with a Microsoft account</p>
          <button
            className="btn-primary export-btn"
            disabled={!hasData || loading !== null}
            onClick={handleFabricExport}
          >
            {loading === 'fabric' ? 'Downloading…' : 'Export & Open Fabric'}
          </button>
          <p className="export-card-hint export-card-hint-metabase">
            Or connect Metabase locally — Run ./start_metabase.sh
            {metabaseRunning && !metabaseChecking && (
              <a href={metabaseUrl} target="_blank" rel="noopener noreferrer" className="metabase-running-link">
                <span className="metabase-status-indicator" aria-hidden />
                Metabase running
              </a>
            )}
          </p>
        </div>
      </div>
      {error && <p className="error-msg">{error}</p>}
    </div>
  )
}

function PipelineFlowDiagram() {
  const mainSteps = [
    { icon: '📈', label: 'Sales History' },
    { icon: '🔮', label: 'Forecasting Engine' },
    { icon: '📋', label: 'Demand Plan' },
    { icon: '🐍', label: 'Python MRP Engine' },
    { icon: '🗄️', label: 'SQLite' },
    { icon: '🤖', label: 'AI Dashboard' },
  ]

  return (
    <div className="pipeline-flow-diagram">
      <div className="pipeline-main-row">
        {mainSteps.map((step, i) => (
          <div key={step.label} className="pipeline-step-group">
            <div className="pipeline-step-box">
              <span className="pipeline-step-icon" aria-hidden>{step.icon}</span>
              <span>{step.label}</span>
            </div>
            {i < mainSteps.length - 1 && <span className="pipeline-arrow-h">→</span>}
          </div>
        ))}
      </div>
      <div className="pipeline-export-branch">
        <span className="pipeline-branch-line" aria-hidden />
        <div className="pipeline-export-box">
          <span className="pipeline-step-icon" aria-hidden>📊</span>
          <span>Metabase BI (live connection)</span>
        </div>
      </div>
    </div>
  )
}

function DatabaseGlyph({ color = 'currentColor' }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
      <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
    </svg>
  )
}

function SqlExplorerPage({ apiUrl, hasData, onUpload }) {
  const [query, setQuery] = useState(SQL_EXAMPLES[0].sql)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [tableCounts, setTableCounts] = useState({})

  useEffect(() => {
    fetch(`${apiUrl}/database/tables`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.tables) return
        const counts = {}
        d.tables.forEach((t) => { counts[t.name] = t.row_count })
        setTableCounts(counts)
      })
      .catch(() => {})
  }, [apiUrl])

  const runQuery = useCallback(async () => {
    if (!query.trim() || loading) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${apiUrl}/sql-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        setResult(null)
      } else {
        setResult(data)
      }
    } catch {
      setError('Could not reach the server. Make sure the backend is running on ' + apiUrl)
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [apiUrl, query, loading])

  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      runQuery()
    }
  }

  if (!hasData) return <EmptyState onUpload={onUpload} />

  return (
    <div className="sql-explorer-page">
      <div className="sql-tables-grid-page">
        {SQL_TABLES.map((t) => (
          <div key={t.name} className="sql-table-card" style={{ borderLeftColor: t.accent }}>
            <div className="sql-table-name" style={{ color: t.accent }}>
              <DatabaseGlyph color={t.accent} />
              <span>{t.name}</span>
            </div>
            <div className="sql-table-count-row">
              <span className="sql-table-count">{tableCounts[t.name] ?? '—'}</span>
              <span className="sql-table-count-label">rows</span>
            </div>
            <div className="sql-table-columns">
              {t.columns.map((col) => (
                <span key={col} className="sql-col-pill">{col}</span>
              ))}
            </div>
          </div>
        ))}

        <div className="sql-table-card sql-db-card" style={{ borderLeftColor: '#7a5af0' }}>
          <div className="sql-table-name" style={{ color: '#7a5af0' }}>
            <DatabaseGlyph color="#7a5af0" />
            <span>Database</span>
          </div>
          <div className="sql-table-count-row">
            <span className="sql-table-count sql-db-value">SQLite</span>
          </div>
          <div className="sql-db-sub">mrp.db • Local</div>
        </div>
      </div>

      <div className="sql-section-divider" />

      <div className="card">
        <div className="example-queries">
          <span className="example-queries-label">Examples:</span>
          {SQL_EXAMPLES.map((ex) => (
            <button key={ex.label} className="chip" onClick={() => setQuery(ex.sql)}>{ex.label}</button>
          ))}
        </div>

        <textarea
          className="sql-query-input sql-editor"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          placeholder="SELECT * FROM mrp_results WHERE planned_order > 0"
        />
        <div className="sql-editor-footer">
          <button className="btn-primary" onClick={runQuery} disabled={loading}>
            {loading ? 'Running…' : 'Run Query'}
          </button>
          <span className="sql-shortcut-hint">⌘/Ctrl + Enter to run</span>
        </div>

        {error && <div className="sql-error">{error}</div>}

        {!error && result && (
          <div className="sql-results">
            <div className="sql-results-meta">
              <span>{result.count} row{result.count !== 1 ? 's' : ''} returned{result.truncated ? ' (showing first 500)' : ''}</span>
              {result.rows.length > 0 && (
                <button className="btn-secondary" onClick={() => exportQueryCSV(result.columns, result.rows)}>Export CSV</button>
              )}
            </div>
            {result.rows.length === 0 ? (
              <p className="sql-empty">Query ran successfully but returned no rows.</p>
            ) : (
              <div className="sql-results-scroll">
                <table className="data-table sql-results-table">
                  <thead>
                    <tr>{result.columns.map((c) => <th key={c}>{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => <td key={j}>{cell === null ? '—' : String(cell)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {!error && !result && (
          <p className="sql-empty">Run a query to see results</p>
        )}
      </div>

      <ExportDataSection apiUrl={apiUrl} hasData={hasData} />
    </div>
  )
}

const SQL_VIEW_SNIPPETS = [
  {
    name: 'vw_stockout_risk',
    sql: `SELECT item_id, item_name, week, projected_inventory, safety_stock,
  projected_inventory - safety_stock AS buffer
FROM mrp_results WHERE projected_inventory < safety_stock`,
  },
  {
    name: 'vw_planned_releases',
    sql: `SELECT item_id, item_name, week, planned_order, release_date, need_date, is_overdue
FROM mrp_results WHERE planned_order > 0 ORDER BY release_date ASC`,
  },
  {
    name: 'vw_supply_gap',
    sql: `SELECT m.item_id, m.item_name, m.week, m.net_req,
  COALESCE(p.order_qty, 0) AS on_order,
  m.net_req - COALESCE(p.order_qty, 0) AS gap
FROM mrp_results m
LEFT JOIN open_pos p ON m.item_id = p.item_id
  AND m.week = p.expected_receipt_week
WHERE m.net_req > 0 ORDER BY m.week ASC`,
  },
]

function AboutPage() {
  const features = [
    'Multi-level BOM explosion',
    'Gross-to-net requirements',
    'Safety stock planning',
    'MOQ-based lot sizing',
    'Lead time offsetting',
    'Real PO release dates',
    'Stockout risk detection',
    'Natural language Q&A',
  ]

  return (
    <div className="about-page">
      <div className="about-hero card">
        <h2>Flowcast — Supply Chain Intelligence</h2>
        <p>End-to-end material requirements planning — from ERP export to AI-powered insights</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>How it works</h3>
          <p>From Excel export to live planning dashboard</p>
        </div>
        <PipelineFlowDiagram />
      </div>

      <div className="card">
        <div className="card-header"><h3>What it calculates</h3></div>
        <div className="feature-badge-grid">
          {features.map((f) => <span key={f} className="feature-badge">{f}</span>)}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Tech stack</h3></div>
        <p className="tech-stack-line">Python · FastAPI · SQLite · React · Recharts · Claude AI · Metabase</p>
      </div>

      <div className="card">
        <div className="card-header"><h3>SQL views</h3></div>
        <div className="sql-views-list">
          {SQL_VIEW_SNIPPETS.map((view) => (
            <div key={view.name} className="sql-view-card">
              <div className="sql-view-header-static">
                <span className="sql-view-name">{view.name}</span>
              </div>
              <div className="sql-view-body">
                <pre className="sql-create-block">{view.sql}</pre>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="about-footer">Built by Nitish Sharma · MS Engineering Management · San Jose State University</p>
    </div>
  )
}

const PAGE_TITLES = {
  upload: { title: 'Upload', subtitle: 'Import or sync your planning data' },
  forecast: { title: 'Demand Forecasting', subtitle: 'Generate statistical forecasts from historical sales data' },
  overview: { title: 'Overview', subtitle: 'Your supply plan at a glance' },
  planning: { title: 'Planning View', subtitle: 'Weekly requirements and release schedule' },
  'purchase-orders': { title: 'Purchase Orders', subtitle: 'Incoming supply from suppliers' },
  assistant: { title: 'AI Assistant', subtitle: 'Get answers about your plan' },
  sql: { title: 'SQL Explorer', subtitle: 'Query your MRP data directly using SQL' },
  about: { title: 'About', subtitle: 'Project overview for interview demo' },
}

export default function App() {
  const [page, setPage] = useState('upload')

  const [hasData, setHasData] = useState(false)
  const [summary, setSummary] = useState(null)
  const [mrpResults, setMrpResults] = useState([])
  const [openPos, setOpenPos] = useState([])
  const [items, setItems] = useState([])
  const [lastUpdated, setLastUpdated] = useState(null)
  const [syncStatus, setSyncStatus] = useState(null)
  const [uploadSuccess, setUploadSuccess] = useState(null)
  const [selectedItemId, setSelectedItemId] = useState('')
  const [pendingChatMessage, setPendingChatMessage] = useState(null)
  const [drilldown, setDrilldown] = useState(null)
  const [apiError, setApiError] = useState('')
  const [sessionActive, setSessionActive] = useState(false)
  const [forecastStatus, setForecastStatus] = useState({ has_sales_history: false, forecast_active: false })
  const loadedTimestampRef = useRef(null)
  const suppressPollUntilRef = useRef(0)

  const selectedItem = getSelectedItem(items, selectedItemId)

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  // Keep the deployed backend awake while the app is open.
  useEffect(() => {
    const keepAlive = () => {
      fetch(`${apiUrl}/health`).catch(() => {})
    }

    keepAlive()
    const interval = setInterval(keepAlive, 10 * 60 * 1000)

    return () => clearInterval(interval)
  }, [apiUrl])

  const clearLocalData = useCallback(() => {
    setHasData(false)
    setSummary(null)
    setMrpResults([])
    setOpenPos([])
    setItems([])
    setLastUpdated(null)
  }, [])

  const fetchAll = useCallback(async () => {
    try {
      const statusRes = await fetch(`${apiUrl}/session-status`)
      if (statusRes.ok) {
        const status = await statusRes.json()
        setSessionActive(!!status.session_active)
        if (!status.session_active) {
          setApiError('')
          clearLocalData()
          setPage('upload')
          return false
        }
      }

      const [sumRes, mrpRes, posRes, itemsRes] = await Promise.all([
        fetch(`${apiUrl}/summary`),
        fetch(`${apiUrl}/mrp-results`),
        fetch(`${apiUrl}/open-pos`),
        fetch(`${apiUrl}/items`),
      ])
      if (!sumRes.ok) {
        setApiError(`The server responded with an error (${sumRes.status}). Some data may be unavailable.`)
        return false
      }
      setApiError('')
      const sum = await sumRes.json()
      if (sum.total_items > 0) {
        setHasData(true)
        setSummary(sum)
        setMrpResults(mrpRes.ok ? await mrpRes.json() : [])
        setOpenPos(posRes.ok ? await posRes.json() : [])
        setItems(itemsRes.ok ? await itemsRes.json() : [])
        return true
      }
      setHasData(false)
      setSummary(null)
      setMrpResults([])
      setOpenPos([])
      setItems([])
      setLastUpdated(null)
      setPage('upload')
      return false
    } catch {
      setApiError(`Could not reach the server at ${apiUrl}. Make sure the backend is running.`)
      return false
    }
  }, [apiUrl])

  const pollForUpdates = useCallback(async () => {
    if (Date.now() < suppressPollUntilRef.current) return
    try {
      const [watchRes, updatedRes] = await Promise.all([
        fetch(`${apiUrl}/watch-status`),
        fetch(`${apiUrl}/last-updated`),
      ])
      if (watchRes.ok) setSyncStatus(await watchRes.json())
      if (!updatedRes.ok) return

      const { last_updated: serverUpdated } = await updatedRes.json()
      if (!serverUpdated) return

      if (loadedTimestampRef.current && loadedTimestampRef.current !== serverUpdated) {
        await fetchAll()
        loadedTimestampRef.current = serverUpdated
        setLastUpdated(serverUpdated)
      } else if (!loadedTimestampRef.current) {
        loadedTimestampRef.current = serverUpdated
        setLastUpdated(serverUpdated)
      }
    } catch { /* offline */ }
  }, [apiUrl, fetchAll])

  const refreshForecastStatus = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/forecast/status`)
      if (res.ok) {
        const data = await res.json()
        setForecastStatus((prev) => ({ ...prev, ...data }))
      }
    } catch { /* ignore */ }
  }, [apiUrl])

  useEffect(() => {
    fetchAll().then(async (has) => {
      if (!has) {
        setPage('upload')
        return
      }
      try {
        const res = await fetch(`${apiUrl}/last-updated`)
        if (res.ok) {
          const data = await res.json()
          loadedTimestampRef.current = data.last_updated
          setLastUpdated(data.last_updated)
        }
      } catch { /* ignore */ }
      refreshForecastStatus()
    })
  }, [fetchAll, apiUrl, refreshForecastStatus])

  useEffect(() => {
    if (!sessionActive) return undefined
    pollForUpdates()
    const id = setInterval(pollForUpdates, 20000)
    return () => clearInterval(id)
  }, [pollForUpdates, sessionActive])

  const goUpload = () => setPage('upload')

  const openDrilldown = useCallback((content, event) => {
    const rect = event?.currentTarget?.getBoundingClientRect?.()
    setDrilldown({
      content,
      anchor: rect ? { x: rect.left, y: rect.bottom + 8 } : null,
    })
  }, [])

  const askAIAbout = useCallback((question) => {
    setDrilldown(null)
    setPendingChatMessage(question)
    setPage('assistant')
  }, [])

  const handlePendingMessageHandled = useCallback(() => {
    setPendingChatMessage(null)
  }, [])

  const handleUploadSuccess = async (data) => {
    setUploadSuccess(data)
    suppressPollUntilRef.current = Date.now() + 20000
    await fetchAll()
    try {
      const res = await fetch(`${apiUrl}/last-updated`)
      if (res.ok) {
        const d = await res.json()
        loadedTimestampRef.current = d.last_updated
        setLastUpdated(d.last_updated)
      }
    } catch { /* ignore */ }
    setPage('upload')
  }
  const goOverview = () => {
    setUploadSuccess(null)
    setPage('overview')
  }

  const handleClearData = async () => {
    try {
      await fetch(`${apiUrl}/clear-data`, { method: 'POST' })
    } catch { /* ignore */ }
    setSessionActive(false)
    setUploadSuccess(null)
    setSelectedItemId('')
    clearLocalData()
    loadedTimestampRef.current = null
    setApiError('')
    setPage('upload')
  }

  const handleLoadSample = async () => {
    const res = await fetch(`${apiUrl}/load-sample`, { method: 'POST' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const detail = body?.detail
      throw new Error(Array.isArray(detail?.errors) ? detail.errors.join(' ') : (detail || 'Could not load sample data'))
    }
    const data = await res.json()
    await handleUploadSuccess(data)
    await refreshForecastStatus()
  }

  const handleItemChange = (itemId) => {
    setSelectedItemId(itemId)
  }

  const meta = PAGE_TITLES[page] || {}

  return (
    <div className="app-shell">
      <CalcDrilldownModal
        content={drilldown?.content}
        anchor={drilldown?.anchor}
        onClose={() => setDrilldown(null)}
        onAskAI={askAIAbout}
      />
      <aside className="sidebar">
        <div className="sidebar-header">
          <FlowcastLogo />
        </div>
        <ItemSelector
          items={items}
          selectedItemId={selectedItemId}
          onChange={handleItemChange}
          hasData={hasData}
        />
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              onClick={() => setPage(item.id)}
            >
              <NavIcon type={item.icon} />
              <span className="nav-label">{item.label}</span>
              {item.id === 'forecast' && hasData && (
                <span className={`nav-badge ${forecastStatus.forecast_active ? 'nav-badge-active' : 'nav-badge-setup'}`}>
                  {forecastStatus.forecast_active ? 'Active' : 'Setup'}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          {sessionActive && (
            <button className="sidebar-clear-btn" onClick={handleClearData} title="Reset to a clean empty state">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.5 9.5a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1L12 4M6.5 7v5M9.5 7v5" />
              </svg>
              <span className="nav-label">Clear data</span>
            </button>
          )}
          <SyncStatus watchStatus={syncStatus} lastUpdated={lastUpdated || syncStatus?.last_updated} />
        </div>
      </aside>

      <div className="main">
        <ApiErrorBanner message={apiError} onRetry={fetchAll} />
        <PageHeader
          title={meta.title}
          subtitle={meta.subtitle}
          lastUpdated={page !== 'about' && page !== 'upload' && hasData ? lastUpdated : null}
        />
        <main className="content">
          <ErrorBoundary resetKey={page}>
          {page === 'upload' && (
            <UploadPage
              apiUrl={apiUrl}
              onSuccess={handleUploadSuccess}
              onGoOverview={goOverview}
              successData={uploadSuccess}
              onClearSuccess={() => setUploadSuccess(null)}
              onLoadSample={handleLoadSample}
            />
          )}
          {page === 'forecast' && (
            <ForecastPage
              apiUrl={apiUrl}
              items={items}
              mrpResults={mrpResults}
              hasData={hasData}
              onUpload={goUpload}
              forecastStatus={forecastStatus}
              onApplied={async () => {
                await fetchAll()
                await refreshForecastStatus()
              }}
              onGoPlanning={() => setPage('planning')}
            />
          )}
          {page === 'overview' && (
            <OverviewPage
              summary={summary}
              mrpResults={mrpResults}
              items={items}
              openPos={openPos}
              hasData={hasData}
              onUpload={goUpload}
              selectedItemId={selectedItemId}
              onOpenDrilldown={openDrilldown}
              lastUpdated={lastUpdated}
              filename={syncStatus?.filename}
              forecastStatus={forecastStatus}
              onDismissForecastBanner={() => setForecastStatus((s) => ({ ...s, bannerDismissed: true }))}
            />
          )}
          {page === 'planning' && (
            <PlanningViewPage
              item={selectedItem}
              items={items}
              mrpResults={mrpResults}
              openPos={openPos}
              summary={summary}
              hasData={hasData}
              onUpload={goUpload}
              selectedItemId={selectedItemId}
              apiUrl={apiUrl}
              onOpenDrilldown={openDrilldown}
              onAskAI={askAIAbout}
            />
          )}
          {page === 'purchase-orders' && (
            <PurchaseOrdersPage openPos={openPos} items={items} hasData={hasData} onUpload={goUpload} selectedItemId={selectedItemId} />
          )}
          {page === 'assistant' && (
            <AssistantPage
              hasData={hasData}
              apiUrl={apiUrl}
              onUpload={goUpload}
              pendingMessage={pendingChatMessage}
              onPendingMessageHandled={handlePendingMessageHandled}
            />
          )}
          {page === 'sql' && (
            <SqlExplorerPage apiUrl={apiUrl} hasData={hasData} onUpload={goUpload} />
          )}
          {page === 'about' && <AboutPage />}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
