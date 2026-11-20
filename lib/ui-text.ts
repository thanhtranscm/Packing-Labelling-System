// Display text only. Never translate material codes, source PO data or Excel cells.
const vietnamese:Record<string,string>={
 'Label':'Tem','Special Label':'Tem đặc biệt','Card':'Thẻ giấy','Outer - Empty - Inner':'Thùng / Thùng rỗng / Hộp','Wrapping Paper':'Giấy gói','Stuffing Paper':'Giấy nhét',
 'BRAND':'NHÃN HIỆU','SEASON':'MÙA','CREATE DATE':'NGÀY TẠO','PRICE':'GIÁ','ORDER TYPE':'LOẠI ĐƠN','PO CATEGORY':'NHÓM ĐƠN','FACTORY PO':'PO NHÀ MÁY','ON PO':'ON PO','SKU':'SKU','COLOR':'MÀU','COUNTRY':'QUỐC GIA','WAREHOUSE':'KHO','MOS':'VẬN CHUYỂN','MODEL':'MẪU GIÀY','GENDER':'GIỚI TÍNH','LIST':'QUỐC GIA ÁP DỤNG','MATERIAL NAME':'TÊN VẬT TƯ','SUPPLIER/ITEM CODE':'MÃ VẬT TƯ','QTY PER FINISH GOOD':'ĐỊNH MỨC','UNIT':'ĐƠN VỊ','BUFFER %':'BUFFER %','PURCHASE':'SỐ LƯỢNG MUA','TOTAL':'TỔNG',
 'ORIGINAL PO':'PO GỐC','MARKET':'THỊ TRƯỜNG','DIMENSION':'KÍCH THƯỚC','TOTAL PAIRS':'TỔNG SỐ ĐÔI','EXGO':'THÁNG XUẤT XƯỞNG','MATERIAL CODE':'MÃ VẬT TƯ','SIZE RANGE':'NHÓM SIZE','PAIRS':'SỐ ĐÔI','QTY / PAIR':'SỐ LƯỢNG / ĐÔI','QUANTITY':'SỐ LƯỢNG','BUFFER QTY':'SỐ LƯỢNG BUFFER','UK SIZE':'SIZE UK',
 'Month':'Tháng','Country':'Quốc gia','Model':'Mẫu giày','Color':'Màu','Order type':'Loại đơn','Gender':'Giới tính','EXGO month':'Tháng xuất xưởng','Total quantity':'Tổng số lượng','Brand':'Nhãn hiệu','Season':'Mùa','Create date':'Ngày tạo','Price':'Giá','PO category':'Nhóm đơn','Warehouse':'Kho','Original PO':'PO gốc','Published file':'File đã xuất'
};
export function uiText(text:string,language:string){return language==='VI'?(vietnamese[text]||text):text;}
