const downloadCsv = (filename: string, content: string) => {
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export const downloadBehaviorTemplate = () => downloadCsv('behavior-template.csv', [
  'user_id,goods_id,category_id,behavior,datetime,price,amount',
  'U001,G001,C01,pv,2026-07-01 10:00:00,299,1',
  'U001,G001,C01,buy,2026-07-01 10:05:00,299,1',
].join('\n'))

export const downloadOrdersTemplate = () => {
  downloadCsv('orders-template.csv', [
    'order_id,user_id,created_at,order_amount,status,channel',
    'O001,U001,2026-07-01 10:05:00,299,paid,douyin',
  ].join('\n'))
  downloadCsv('order-items-template.csv', [
    'order_id,product_id,product_name,quantity,price',
    'O001,P001,轻氧防晒衣,1,299',
  ].join('\n'))
  downloadCsv('products-template.csv', [
    'product_id,product_name,category_id,price',
    'P001,轻氧防晒衣,C01,299',
  ].join('\n'))
}
