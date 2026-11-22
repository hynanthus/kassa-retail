import { getDatabase, persistDatabase } from '../../db/database'

export interface Client {
  id: string
  name: string
  phone: string
  debt: number
  lastPurchase: string | null
}

export interface ClientDebt {
  id: string
  clientId: string
  amount: number
  reason: string
  createdAt: string
}

const clientToEntity = (row: Record<string, string | number | boolean | null>): Client => ({
  id: String(row.id),
  name: String(row.name),
  phone: String(row.phone),
  debt: Number(row.debt ?? 0),
  lastPurchase: row.lastPurchase ? String(row.lastPurchase) : null,
})

const nowISO = () => new Date().toISOString()

export const ClientRepo = {
  async list(): Promise<Client[]> {
    const db = getDatabase()
    const result = db.exec(
      'SELECT id, name, phone, COALESCE(debt, 0) AS debt, (SELECT MAX(date) FROM sales WHERE clientId = clients.id) AS lastPurchase FROM clients ORDER BY name'
    )
    const rows = result[0]?.values ?? []
    return rows.map((r) => clientToEntity(r.reduce((acc, v, i) => ((acc as any)[result[0].columns[i]] = v, acc), {} as Record<string, any>)))
  },

  async get(id: string): Promise<Client | null> {
    const clients = await this.list()
    return clients.find((c) => c.id === id) ?? null
  },

  async add(client: Omit<Client, 'id'>): Promise<string> {
    const db = getDatabase()
    const id = crypto.randomUUID()
    db.run(
      'INSERT INTO clients (id, name, phone, notes, debt, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
      [id, client.name, client.phone, '', client.debt ?? 0, nowISO()]
    )
    persistDatabase()
    return id
  },

  async update(id: string, client: Partial<Omit<Client, 'id'>>) {
    const db = getDatabase()
    const prevDebt = Number(
      db.exec('SELECT COALESCE(debt, 0) FROM clients WHERE id = ?', [id])[0]?.values[0]?.[0] ?? 0
    )
    const nextDebt = Number(client.debt ?? 0)
    db.run(
      'UPDATE clients SET name = ?, phone = ?, notes = ?, debt = ? WHERE id = ?',
      [client.name ?? '', client.phone ?? '', '', nextDebt, id]
    )
    // Ручное изменение долга фиксируем корректировочной записью в истории,
    // чтобы сумма записей всегда совпадала с текущим долгом клиента.
    const delta = nextDebt - prevDebt
    if (delta !== 0) {
      db.run(
        'INSERT INTO client_debts (id, clientId, amount, reason, createdAt) VALUES (?, ?, ?, ?, ?)',
        [crypto.randomUUID(), id, delta, 'Корректировка вручную', nowISO()]
      )
    }
    persistDatabase()
  },

  async remove(id: string): Promise<void> {
    const db = getDatabase()
    db.run('DELETE FROM client_debts WHERE clientId = ?', [id])
    db.run('DELETE FROM clients WHERE id = ?', [id])
    persistDatabase()
  },

  async search(query: string): Promise<Client[]> {
    const db = getDatabase()
    const result = db.exec(
      'SELECT id, name, phone, COALESCE(debt, 0) AS debt FROM clients WHERE name LIKE ? OR phone LIKE ? ORDER BY name',
      [`%${query}%`, `%${query}%`]
    )
    const rows = result[0]?.values ?? []
    return rows.map((r) => clientToEntity(r.reduce((acc, v, i) => ((acc as any)[result[0].columns[i]] = v, acc), {} as Record<string, any>)))
  },

  async listDebts(clientId: string): Promise<ClientDebt[]> {
    const db = getDatabase()
    const result = db.exec(
      'SELECT id, clientId, amount, reason, createdAt FROM client_debts WHERE clientId = ? ORDER BY createdAt DESC',
      [clientId]
    )
    const rows = result[0]?.values ?? []
    return rows.map((row) =>
      row.reduce((acc, value, index) => {
        acc[result[0].columns[index]] = value
        return acc
      }, {} as Record<string, unknown>)
    ).map((row) => ({
      id: String(row.id),
      clientId: String(row.clientId),
      amount: Number(row.amount ?? 0),
      reason: String(row.reason ?? ''),
      createdAt: String(row.createdAt ?? ''),
    }))
  },

  async addDebt(clientId: string, amount: number, reason: string): Promise<string> {
    const db = getDatabase()
    const id = crypto.randomUUID()
    db.run(
      'INSERT INTO client_debts (id, clientId, amount, reason, createdAt) VALUES (?, ?, ?, ?, ?)',
      [id, clientId, amount, reason, nowISO()]
    )
    db.run('UPDATE clients SET debt = COALESCE(debt, 0) + ? WHERE id = ?', [amount, clientId])
    persistDatabase()
    return id
  },

  async removeDebt(debtId: string): Promise<void> {
    const db = getDatabase()
    const result = db.exec('SELECT clientId, amount FROM client_debts WHERE id = ?', [debtId])
    const row = result[0]?.values[0]
    if (!row) return
    const clientId = String(row[0])
    const amount = Number(row[1] ?? 0)
    db.run('DELETE FROM client_debts WHERE id = ?', [debtId])
    db.run('UPDATE clients SET debt = MAX(COALESCE(debt, 0) - ?, 0) WHERE id = ?', [amount, clientId])
    persistDatabase()
  },

  async seed(): Promise<void> {
    const db = getDatabase()
    const seeds: Omit<Client, 'id'>[] = [
      { name: 'Александр Иванов', phone: '+7 777 123 45 67', debt: 4500, lastPurchase: '2026-11-03' },
      { name: 'Мария Петрова', phone: '+7 777 234 56 78', debt: 0, lastPurchase: '2026-11-02' },
      { name: 'Елена Смирнова', phone: '+7 777 345 67 89', debt: 3800, lastPurchase: '2026-11-01' },
      { name: 'Дмитрий Кузнецов', phone: '+7 777 456 78 90', debt: 1200, lastPurchase: '2026-10-30' },
      { name: 'Ольга Васильева', phone: '+7 777 567 89 01', debt: 0, lastPurchase: '2026-11-04' },
    ]
    for (const c of seeds) {
      db.run('INSERT INTO clients (id, name, phone, notes, debt, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [
        crypto.randomUUID(),
        c.name,
        c.phone,
        '',
        c.debt,
        nowISO(),
      ])
    }
  },
}
