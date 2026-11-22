import { getDatabase, persistDatabase } from '../../db/database'
import { CertificateRepo } from './CertificateRepo'

export type PaymentMethod = 'cash' | 'card' | 'qr' | 'certificate'

export interface SaleItemInput {
  productId: string
  sku: string
  name: string
  quantity: number
  price: number
  discountPercent: number
}

export interface CreateSaleInput {
  cashierId: string
  clientId?: string | null
  paymentMethod: PaymentMethod
  paidAmount: number
  totalAmount: number
  certificateId?: string | null
  items: SaleItemInput[]
}

const pad = (n: number) => String(n).padStart(2, '0')

function nowLocalISO(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

export const SaleRepo = {
  async create(input: CreateSaleInput): Promise<string> {
    const db = getDatabase()
    const id = crypto.randomUUID()
    const saleNumber = `CHK-${Date.now()}`

    db.run('BEGIN TRANSACTION')
    try {
      db.run(
        `INSERT INTO sales (id, saleNumber, date, cashierId, clientId, totalAmount, paidAmount, paymentMethod, certificateId, status, comment)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', '')`,
        [
          id,
          saleNumber,
          nowLocalISO(),
          input.cashierId,
          input.clientId ?? null,
          input.totalAmount,
          input.paidAmount,
          input.paymentMethod,
          input.certificateId ?? null,
        ]
      )

      for (const item of input.items) {
        const subtotal = item.price * item.quantity * (1 - item.discountPercent / 100)
        db.run(
          `INSERT INTO sale_items (id, saleId, productId, sku, name, quantity, price, discountAmount, discountPercent, subtotal)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            crypto.randomUUID(),
            id,
            item.productId,
            item.sku,
            item.name,
            item.quantity,
            item.price,
            item.price * item.quantity * (item.discountPercent / 100),
            item.discountPercent,
            subtotal,
          ]
        )
        db.run('UPDATE products SET stockCount = stockCount - ?, updatedAt = ? WHERE id = ?', [
          item.quantity,
          nowLocalISO(),
          item.productId,
        ])
      }

      // Списание с сертификата — в той же транзакции: если средств не хватает
      // или сертификат истёк, продажа откатывается целиком.
      if (input.paymentMethod === 'certificate' && input.certificateId) {
        await CertificateRepo.consumeInTransaction(input.certificateId, input.totalAmount)
      }

      db.run('COMMIT')
      persistDatabase()
      return id
    } catch (error) {
      db.run('ROLLBACK')
      throw error
    }
  },
}
