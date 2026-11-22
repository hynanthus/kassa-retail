import { getDatabase, persistDatabase } from '../../db/database'

export interface Certificate {
  id: string
  code: string
  amount: number
  usedAmount: number
  startDate: string
  endDate: string
  active: boolean
}

const certToEntity = (row: Record<string, string | number | boolean | null>): Certificate => ({
  id: String(row.id),
  code: String(row.code),
  amount: Number(row.amount),
  usedAmount: Number(row.usedAmount),
  startDate: String(row.startDate),
  endDate: String(row.endDate),
  active: Boolean(row.isActive),
})

const nowISO = () => new Date().toISOString()

export const CertificateRepo = {
  async list(): Promise<Certificate[]> {
    const db = getDatabase()
    const result = db.exec('SELECT id, code, amount, usedAmount, startDate, endDate, isActive FROM certificates ORDER BY code')
    const rows = result[0]?.values ?? []
    return rows.map((r) => certToEntity(r.reduce((acc, v, i) => ((acc as any)[result[0].columns[i]] = v, acc), {} as Record<string, any>)))
  },

  async get(id: string): Promise<Certificate | null> {
    const certs = await this.list()
    return certs.find((c) => c.id === id) ?? null
  },

  async add(code: string, amount: number, startDate: string, endDate: string): Promise<string> {
    const db = getDatabase()
    const id = crypto.randomUUID()
    db.run(
      'INSERT INTO certificates (id, code, amount, usedAmount, startDate, endDate, isActive, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, code, amount, 0, startDate, endDate, 1, 'admin', nowISO()]
    )
    persistDatabase()
    return id
  },

  async updateUsed(id: string, used: number): Promise<void> {
    const db = getDatabase()
    // Полностью использованный сертификат деактивируется; повторно не активируется.
    db.run('UPDATE certificates SET usedAmount = ?, isActive = CASE WHEN ? >= amount THEN 0 ELSE isActive END WHERE id = ?', [used, used, id])
    persistDatabase()
  },

  /**
   * Списывает сумму с сертификата внутри текущей транзакции вызывающего кода.
   * Бросает ошибку, если сертификата нет, он неактивен, истёк или остатка недостаточно.
   */
  async consumeInTransaction(id: string, amount: number): Promise<void> {
    const db = getDatabase()
    const row = db.exec('SELECT usedAmount, amount, isActive, endDate FROM certificates WHERE id = ?', [id])[0]
      ?.values[0]
    if (!row) throw new Error('CERT_NOT_FOUND')
    const usedAmount = Number(row[0])
    const total = Number(row[1])
    const active = Boolean(row[2])
    const endDate = String(row[3])
    if (!active) throw new Error('CERT_INACTIVE')
    if (endDate && endDate < new Date().toISOString().slice(0, 10)) throw new Error('CERT_EXPIRED')
    if (total - usedAmount < amount) throw new Error('CERT_INSUFFICIENT')
    db.run('UPDATE certificates SET usedAmount = ?, isActive = CASE WHEN ? >= amount THEN 0 ELSE isActive END WHERE id = ?', [
      usedAmount + amount,
      usedAmount + amount,
      id,
    ])
  },

  async remove(id: string): Promise<void> {
    const db = getDatabase()
    db.run('DELETE FROM certificates WHERE id = ?', [id])
    persistDatabase()
  },

  async search(query: string): Promise<Certificate[]> {
    const db = getDatabase()
    const result = db.exec(
      'SELECT id, code, amount, usedAmount, startDate, endDate, isActive FROM certificates WHERE code LIKE ? ORDER BY code',
      [`%${query}%`]
    )
    const rows = result[0]?.values ?? []
    return rows.map((r) => certToEntity(r.reduce((acc, v, i) => ((acc as any)[result[0].columns[i]] = v, acc), {} as Record<string, any>)))
  },

  async seed(): Promise<void> {
    const db = getDatabase()
    const seeds: { code: string; amount: number; startDate: string; endDate: string; used: number; active: boolean }[] = [
      { code: 'CERT-001', amount: 5000, startDate: '2026-01-01', endDate: '2027-01-01', used: 0, active: true },
      { code: 'CERT-002', amount: 10000, startDate: '2026-01-01', endDate: '2027-01-01', used: 3000, active: true },
      { code: 'CERT-003', amount: 3000, startDate: '2026-01-01', endDate: '2026-06-01', used: 3000, active: false },
    ]
    for (const c of seeds) {
      db.run(
        'INSERT INTO certificates (id, code, amount, usedAmount, startDate, endDate, isActive, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [crypto.randomUUID(), c.code, c.amount, c.used, c.startDate, c.endDate, c.active ? 1 : 0, 'admin', nowISO()]
      )
    }
    persistDatabase()
  },
}
