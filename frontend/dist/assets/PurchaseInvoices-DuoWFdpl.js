import{r as m,u as pe,R as X,a3 as xe,a4 as me,a5 as he,a6 as ue,a7 as ge,a8 as be,a9 as ye,aa as fe,p as e,Q as je,S as Ne,a2 as ve,C as we,B as H,z as Se,y as Ie}from"./index-DaTQeIrM.js";import{g as De}from"./ComponentRegistry-DXgiU2WN.js";import{P as Me}from"./plus-CH9F90nm.js";import{F as Ce}from"./filter-Dd-_7AND.js";import{E as $e}from"./eye-DQ0qHB88.js";import{P as K}from"./printer-sSBWtYCz.js";import{P as Pe}from"./pen-square-CD6kqgaB.js";import{T as Te}from"./trash-2-NO2IJ0Re.js";import{X as W}from"./x-circle-CEJfwNq8.js";import{C as S}from"./check-circle-C7Swk4iC.js";const Ae=(i=new Date)=>{const x=i.getFullYear(),o=String(i.getMonth()+1).padStart(2,"0"),h=String(i.getDate()).padStart(2,"0");return`${x}-${o}-${h}`},ke=({status:i})=>{const x={draft:{color:"bg-gray-100 text-gray-800",icon:we,label:"Draft"},confirmed:{color:"bg-blue-100 text-blue-800",icon:S,label:"Confirmed"},received:{color:"bg-green-100 text-green-800",icon:S,label:"Received"},paid:{color:"bg-green-100 text-green-800",icon:S,label:"Paid"},cancelled:{color:"bg-red-100 text-red-800",icon:W,label:"Cancelled"},closed:{color:"bg-gray-100 text-gray-800",icon:W,label:"Closed"}},o=x[i]||x.draft,h=o.icon;return e.jsxs("span",{className:`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${o.color}`,children:[e.jsx(h,{className:"h-3 w-3 mr-1"}),o.label]})},We=()=>{var P,T,A,k,E,F,L,R,z,V,_,q,O;const[i,x]=m.useState(""),[o,h]=m.useState(""),I=Ae(),[u,Z]=m.useState(I),[g,ee]=m.useState(I),[a,te]=m.useState(null),[se,D]=m.useState(!1),{openTab:ae}=pe(),re=X.useMemo(()=>{const t={search:i||void 0,status:o||void 0};return u&&(t.dateFrom=u),g&&(t.dateTo=g),t},[i,o,u,g]),{data:r,isLoading:ne,error:le,refetch:M}=xe(re,{refetchOnMountOrArgChange:!0}),[Ee,{isLoading:Fe}]=me(),[ie,{isLoading:Le}]=he(),[Re]=ue(),[ze]=ge(),[Ve]=be(),[_e]=ye(),[qe]=fe(),C=t=>{var p,b,y,f,j,N,U,Q,G,Y,B,J;if(!t)return;const n=window.open("","_blank");if(!n)return;const s=c=>c?String(c).replace(/[&<>"']/g,v=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[v]):"",l=(t.items||[]).map(c=>{var v,w;return`
      <tr>
        <td class="border border-gray-300 px-4 py-2">${s(((v=c.product)==null?void 0:v.name)||"Unknown Product")}</td>
        <td class="border border-gray-300 px-4 py-2">${s(((w=c.product)==null?void 0:w.description)||"")}</td>
        <td class="border border-gray-300 px-4 py-2 text-right">${c.quantity||0}</td>
        <td class="border border-gray-300 px-4 py-2 text-right">${Math.round(c.unitCost||0)}</td>
        <td class="border border-gray-300 px-4 py-2 text-right">${Math.round(c.totalCost||0)}</td>
      </tr>
    `}).join("")||`
      <tr>
        <td colspan="5" class="border border-gray-300 px-4 py-2 text-center text-gray-500">No items found</td>
      </tr>
    `,d=`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Purchase Invoice ${s(t.invoiceNumber)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; color: #111827; }
    .header { text-align: center; margin-bottom: 30px; }
    .company-name { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
    .invoice-type { font-size: 18px; color: #6b7280; }
    .invoice-details { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 30px; }
    .supplier-info, .invoice-info, .payment-info { width: 100%; }
    .invoice-info, .payment-info { text-align: right; }
    .section-title { font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid #ccc; padding-bottom: 5px; font-size: 14px; }
    .section-content { font-size: 14px; }
    .section-content p { margin: 4px 0; }
    .font-medium { font-weight: 500; }
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    .items-table th, .items-table td { border: 1px solid #ccc; padding: 8px; }
    .items-table th { background-color: #f5f5f5; font-weight: bold; text-align: left; }
    .items-table .text-right { text-align: right; }
    .border { border: 1px solid #ccc; }
    .border-gray-300 { border-color: #ccc; }
    .px-4 { padding-left: 16px; padding-right: 16px; }
    .py-2 { padding-top: 8px; padding-bottom: 8px; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .text-gray-500 { color: #6b7280; }
    .totals { margin-left: auto; width: 300px; }
    .totals table { width: 100%; }
    .totals td { padding: 5px 10px; font-size: 14px; }
    .totals .total-row { font-weight: bold; }
    .totals .total-row td { border-top: 2px solid #000; }
    .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; }
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-name">Your Company Name</div>
    <div class="invoice-type">Purchase Invoice</div>
  </div>
  
  <div class="invoice-details">
    <div class="supplier-info">
      <div class="section-title">Supplier Details:</div>
      <div class="section-content">
        <p style="font-weight: 500;">${s(((p=t.supplierInfo)==null?void 0:p.companyName)||((b=t.supplierInfo)==null?void 0:b.name)||"Unknown Supplier")}</p>
        <p>${s(((y=t.supplierInfo)==null?void 0:y.email)||"")}</p>
        <p>${s(((f=t.supplierInfo)==null?void 0:f.phone)||"")}</p>
        <p>${s(((j=t.supplierInfo)==null?void 0:j.address)||"")}</p>
      </div>
    </div>
    <div class="invoice-info">
      <div class="section-title">Invoice Details:</div>
      <div class="section-content">
        <p><span class="font-medium">Invoice #:</span> ${s(t.invoiceNumber)}</p>
        <p><span class="font-medium">Date:</span> ${new Date(t.createdAt).toLocaleDateString()}</p>
        <p><span class="font-medium">Status:</span> ${s(t.status)}</p>
        <p><span class="font-medium">Type:</span> Purchase</p>
      </div>
    </div>
    <div class="payment-info">
      <div class="section-title">Payment:</div>
      <div class="section-content">
        <p><span class="font-medium">Status:</span> ${s(((N=t.payment)==null?void 0:N.status)||"pending")}</p>
        <p><span class="font-medium">Method:</span> ${s(((U=t.payment)==null?void 0:U.method)||"cash")}</p>
        <p><span class="font-medium">Amount:</span> ${Math.round(((Q=t.pricing)==null?void 0:Q.total)||0)}</p>
      </div>
    </div>
  </div>
  
  <div>
    <div class="section-title" style="margin-bottom: 10px;">Items:</div>
    <table class="items-table">
      <thead>
        <tr>
          <th class="border border-gray-300 px-4 py-2 text-left">Item</th>
          <th class="border border-gray-300 px-4 py-2 text-left">Description</th>
          <th class="border border-gray-300 px-4 py-2 text-right">Qty</th>
          <th class="border border-gray-300 px-4 py-2 text-right">Cost</th>
          <th class="border border-gray-300 px-4 py-2 text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${l}
      </tbody>
    </table>
  </div>
  
  <div class="totals" style="display: flex; justify-content: flex-end;">
    <table>
      <tbody>
        <tr>
          <td class="px-4 py-2">Subtotal:</td>
          <td class="px-4 py-2 text-right">${Math.round(((G=t.pricing)==null?void 0:G.subtotal)||0)}</td>
        </tr>
        ${((Y=t.pricing)==null?void 0:Y.taxAmount)>0?`
        <tr>
          <td class="px-4 py-2">Tax:</td>
          <td class="px-4 py-2 text-right">${Math.round(t.pricing.taxAmount)}</td>
        </tr>
        `:""}
        ${((B=t.pricing)==null?void 0:B.discountAmount)>0?`
        <tr>
          <td class="px-4 py-2">Discount:</td>
          <td class="px-4 py-2 text-right">${Math.round(t.pricing.discountAmount)}</td>
        </tr>
        `:""}
        <tr class="total-row">
          <td class="px-4 py-2 font-bold">Total:</td>
          <td class="px-4 py-2 text-right font-bold">${Math.round(((J=t.pricing)==null?void 0:J.total)||0)}</td>
        </tr>
      </tbody>
    </table>
  </div>
  
  <div class="footer">
    Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
  </div>
  
  <script>window.onload=()=>{window.print();}<\/script>
</body>
</html>`;n.document.open(),n.document.write(d),n.document.close()},oe=t=>{var s,l,d;const n=t.status==="confirmed"?`Are you sure you want to delete invoice ${t.invoiceNumber}?

This will:
• Remove ${((s=t.items)==null?void 0:s.length)||0} products from inventory
• Reduce supplier balance by ${Math.round((((l=t.pricing)==null?void 0:l.total)||0)-(((d=t.payment)==null?void 0:d.amount)||0))}`:`Are you sure you want to delete invoice ${t.invoiceNumber}?`;window.confirm(n)&&ie(t._id).unwrap().then(()=>{H("Purchase invoice deleted successfully"),M()}).catch(p=>{Ie(p,"Purchase Invoice Deletion")})},ce=t=>{const n=De("/purchase");if(n){const s=`tab_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,l={invoiceId:t._id,invoiceNumber:t.invoiceNumber,supplier:t.supplierInfo,items:t.items||[],notes:t.notes||"",invoiceType:t.invoiceType||"purchase",isEditMode:!0};ae({title:`Edit Purchase - ${t.invoiceNumber}`,path:"/purchase",component:n.component,icon:n.icon,allowMultiple:!0,props:{tabId:s,editData:l}}),H(`Opening ${t.invoiceNumber} for editing...`)}else Se("Purchase page not found")},de=t=>{te(t),D(!0)},$=X.useMemo(()=>{var t,n,s;return r?(t=r==null?void 0:r.data)!=null&&t.invoices?r.data.invoices:r!=null&&r.invoices?r.invoices:(s=(n=r==null?void 0:r.data)==null?void 0:n.data)!=null&&s.invoices?r.data.data.invoices:Array.isArray(r)?r:Array.isArray(r==null?void 0:r.data)?r.data:[]:[]},[r]);return ne?e.jsx(je,{}):le?e.jsxs("div",{className:"text-center py-12",children:[e.jsx("p",{className:"text-red-600",children:"Failed to load purchase invoices"}),e.jsx("button",{onClick:M,className:"btn btn-primary mt-4",children:"Try Again"})]}):e.jsxs("div",{className:"space-y-6",children:[e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsxs("div",{children:[e.jsx("h1",{className:"text-2xl font-bold text-gray-900",children:"Purchase Invoices"}),e.jsx("p",{className:"text-gray-600",children:"Track and manage supplier invoices and receipts"})]}),e.jsxs("button",{className:"btn btn-primary btn-md",children:[e.jsx(Me,{className:"h-4 w-4 mr-2"}),"New Invoice"]})]}),e.jsxs("div",{className:"card",children:[e.jsx("div",{className:"card-header",children:e.jsxs("div",{className:"flex items-center space-x-2",children:[e.jsx(Ce,{className:"h-5 w-5 text-gray-400"}),e.jsx("h3",{className:"text-lg font-medium text-gray-900",children:"Filters"})]})}),e.jsx("div",{className:"card-content",children:e.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4",children:[e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:"Search"}),e.jsxs("div",{className:"relative",children:[e.jsx(Ne,{className:"absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400"}),e.jsx("input",{type:"text",placeholder:"Invoice number, supplier, amount...",value:i,onChange:t=>x(t.target.value),className:"input pl-10 w-full h-[42px]"})]})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:"From Date"}),e.jsx("input",{type:"date",value:u,onChange:t=>Z(t.target.value),className:"input h-[42px]"})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:"To Date"}),e.jsx("input",{type:"date",value:g,onChange:t=>ee(t.target.value),className:"input h-[42px]"})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:"Status"}),e.jsxs("select",{value:o,onChange:t=>h(t.target.value),className:"input h-[42px]",children:[e.jsx("option",{value:"",children:"All Status"}),e.jsx("option",{value:"draft",children:"Draft"}),e.jsx("option",{value:"confirmed",children:"Confirmed"}),e.jsx("option",{value:"received",children:"Received"}),e.jsx("option",{value:"paid",children:"Paid"}),e.jsx("option",{value:"cancelled",children:"Cancelled"}),e.jsx("option",{value:"closed",children:"Closed"})]})]})]})})]}),$.length===0?e.jsxs("div",{className:"text-center py-12",children:[e.jsx(ve,{className:"mx-auto h-12 w-12 text-gray-400"}),e.jsx("h3",{className:"mt-2 text-sm font-medium text-gray-900",children:"No purchase invoices found"}),e.jsx("p",{className:"mt-1 text-sm text-gray-500",children:i||o||u||g?"Try adjusting your filters.":"No purchase invoices have been created yet."})]}):e.jsxs("div",{className:"bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden",children:[e.jsx("div",{className:"bg-gray-50 px-6 py-3 border-b border-gray-200",children:e.jsxs("div",{className:"grid grid-cols-12 gap-4 text-xs font-medium text-gray-500 uppercase tracking-wider",children:[e.jsx("div",{className:"col-span-2",children:"Invoice Number"}),e.jsx("div",{className:"col-span-2",children:"Supplier"}),e.jsx("div",{className:"col-span-1",children:"Date"}),e.jsx("div",{className:"col-span-1",children:"Items"}),e.jsx("div",{className:"col-span-1",children:"Total"}),e.jsx("div",{className:"col-span-1",children:"Status"}),e.jsx("div",{className:"col-span-1",children:"Payment"}),e.jsx("div",{className:"col-span-1",children:"Notes"}),e.jsx("div",{className:"col-span-2",children:"Actions"})]})}),e.jsx("div",{className:"divide-y divide-gray-200",children:$.map(t=>{var n,s,l,d,p,b,y,f,j,N;return e.jsx("div",{className:"px-6 py-4 hover:bg-gray-50 transition-colors",children:e.jsxs("div",{className:"grid grid-cols-12 gap-4 items-center",children:[e.jsx("div",{className:"col-span-2",children:e.jsx("div",{className:"font-medium text-gray-900 truncate",children:t.invoiceNumber})}),e.jsx("div",{className:"col-span-2",children:e.jsx("div",{className:"text-sm text-gray-900 truncate",children:((n=t.supplierInfo)==null?void 0:n.companyName)||((s=t.supplierInfo)==null?void 0:s.name)||"Unknown Supplier"})}),e.jsx("div",{className:"col-span-1",children:e.jsx("span",{className:"text-sm text-gray-600",children:new Date(t.createdAt).toLocaleDateString()})}),e.jsx("div",{className:"col-span-1",children:e.jsx("span",{className:"text-sm text-gray-600",children:((l=t.items)==null?void 0:l.length)||0})}),e.jsx("div",{className:"col-span-1",children:e.jsx("span",{className:"font-semibold text-gray-900",children:Math.round(((d=t.pricing)==null?void 0:d.total)||0)})}),e.jsx("div",{className:"col-span-1",children:e.jsx(ke,{status:t.status})}),e.jsx("div",{className:"col-span-1",children:e.jsx("span",{className:`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${((p=t.payment)==null?void 0:p.status)==="paid"?"bg-green-100 text-green-800":((b=t.payment)==null?void 0:b.status)==="partial"?"bg-yellow-100 text-yellow-800":((y=t.payment)==null?void 0:y.status)==="overdue"?"bg-red-100 text-red-800":"bg-gray-100 text-gray-800"}`,children:((f=t.payment)==null?void 0:f.status)||"pending"})}),e.jsx("div",{className:"col-span-1",children:e.jsx("span",{className:"text-xs text-gray-600 block truncate",title:((j=t.notes)==null?void 0:j.trim())||"No notes",children:((N=t.notes)==null?void 0:N.trim())||"—"})}),e.jsx("div",{className:"col-span-2",children:e.jsxs("div",{className:"flex items-center space-x-1",children:[e.jsx("button",{onClick:()=>de(t),className:"text-gray-600 hover:text-gray-800 p-1",title:"View Invoice",children:e.jsx($e,{className:"h-4 w-4"})}),e.jsx("button",{onClick:()=>C(t),className:"text-green-600 hover:text-green-800 p-1",title:"Print Invoice",children:e.jsx(K,{className:"h-4 w-4"})}),e.jsx("button",{onClick:()=>ce(t),className:"text-blue-600 hover:text-blue-800 p-1",title:"Edit Invoice",children:e.jsx(Pe,{className:"h-4 w-4"})}),!["paid","closed"].includes(t.status)&&e.jsx("button",{onClick:()=>oe(t),className:"text-red-600 hover:text-red-800 p-1",title:"Delete Invoice",children:e.jsx(Te,{className:"h-4 w-4"})})]})})]})},t._id)})})]}),se&&a&&e.jsx("div",{className:"fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50",children:e.jsx("div",{className:"bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto",children:e.jsxs("div",{className:"p-6",children:[e.jsxs("div",{className:"flex justify-between items-center mb-6",children:[e.jsx("h2",{className:"text-2xl font-bold text-gray-900",children:"Purchase Invoice Details"}),e.jsxs("div",{className:"flex space-x-2",children:[e.jsxs("button",{onClick:()=>C(a),className:"bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center space-x-2",children:[e.jsx(K,{className:"h-4 w-4"}),e.jsx("span",{children:"Print"})]}),e.jsx("button",{onClick:()=>D(!1),className:"bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700",children:"Close"})]})]}),e.jsxs("div",{className:"text-center mb-8",children:[e.jsx("h1",{className:"text-3xl font-bold text-gray-900",children:"Your Company Name"}),e.jsx("p",{className:"text-lg text-gray-600",children:"Purchase Invoice"})]}),e.jsxs("div",{className:"grid grid-cols-3 gap-8 mb-8",children:[e.jsxs("div",{children:[e.jsx("h3",{className:"font-semibold text-gray-900 border-b border-gray-300 pb-2 mb-4",children:"Supplier Details:"}),e.jsxs("div",{className:"space-y-1",children:[e.jsx("p",{className:"font-medium",children:((P=a.supplierInfo)==null?void 0:P.companyName)||((T=a.supplierInfo)==null?void 0:T.name)||"Unknown Supplier"}),e.jsx("p",{className:"text-gray-600",children:((A=a.supplierInfo)==null?void 0:A.email)||""}),e.jsx("p",{className:"text-gray-600",children:((k=a.supplierInfo)==null?void 0:k.phone)||""}),e.jsx("p",{className:"text-gray-600",children:((E=a.supplierInfo)==null?void 0:E.address)||""})]})]}),e.jsxs("div",{className:"text-right",children:[e.jsx("h3",{className:"font-semibold text-gray-900 border-b border-gray-300 pb-2 mb-4",children:"Invoice Details:"}),e.jsxs("div",{className:"space-y-1",children:[e.jsxs("p",{children:[e.jsx("span",{className:"font-medium",children:"Invoice #:"})," ",a.invoiceNumber]}),e.jsxs("p",{children:[e.jsx("span",{className:"font-medium",children:"Date:"})," ",new Date(a.createdAt).toLocaleDateString()]}),e.jsxs("p",{children:[e.jsx("span",{className:"font-medium",children:"Status:"})," ",a.status]}),e.jsxs("p",{children:[e.jsx("span",{className:"font-medium",children:"Type:"})," Purchase"]})]})]}),e.jsxs("div",{className:"text-right",children:[e.jsx("h3",{className:"font-semibold text-gray-900 border-b border-gray-300 pb-2 mb-4",children:"Payment:"}),e.jsxs("div",{className:"space-y-1",children:[e.jsxs("p",{children:[e.jsx("span",{className:"font-medium",children:"Status:"})," ",((F=a.payment)==null?void 0:F.status)||"pending"]}),e.jsxs("p",{children:[e.jsx("span",{className:"font-medium",children:"Method:"})," ",((L=a.payment)==null?void 0:L.method)||"cash"]}),e.jsxs("p",{children:[e.jsx("span",{className:"font-medium",children:"Amount:"})," ",Math.round(((R=a.pricing)==null?void 0:R.total)||0)]})]})]})]}),e.jsxs("div",{className:"mb-8",children:[e.jsx("h3",{className:"font-semibold text-gray-900 border-b border-gray-300 pb-2 mb-4",children:"Items:"}),e.jsx("div",{className:"overflow-x-auto",children:e.jsxs("table",{className:"w-full border-collapse border border-gray-300",children:[e.jsx("thead",{children:e.jsxs("tr",{className:"bg-gray-50",children:[e.jsx("th",{className:"border border-gray-300 px-4 py-2 text-left",children:"Item"}),e.jsx("th",{className:"border border-gray-300 px-4 py-2 text-left",children:"Description"}),e.jsx("th",{className:"border border-gray-300 px-4 py-2 text-right",children:"Qty"}),e.jsx("th",{className:"border border-gray-300 px-4 py-2 text-right",children:"Cost"}),e.jsx("th",{className:"border border-gray-300 px-4 py-2 text-right",children:"Total"})]})}),e.jsx("tbody",{children:((z=a.items)==null?void 0:z.map((t,n)=>{var s,l;return e.jsxs("tr",{children:[e.jsx("td",{className:"border border-gray-300 px-4 py-2",children:((s=t.product)==null?void 0:s.name)||"Unknown Product"}),e.jsx("td",{className:"border border-gray-300 px-4 py-2",children:((l=t.product)==null?void 0:l.description)||""}),e.jsx("td",{className:"border border-gray-300 px-4 py-2 text-right",children:t.quantity}),e.jsx("td",{className:"border border-gray-300 px-4 py-2 text-right",children:Math.round(t.unitCost||0)}),e.jsx("td",{className:"border border-gray-300 px-4 py-2 text-right",children:Math.round(t.totalCost||0)})]},n)}))||e.jsx("tr",{children:e.jsx("td",{colSpan:"5",className:"border border-gray-300 px-4 py-2 text-center text-gray-500",children:"No items found"})})})]})})]}),e.jsx("div",{className:"flex justify-end",children:e.jsx("div",{className:"w-80",children:e.jsx("table",{className:"w-full",children:e.jsxs("tbody",{children:[e.jsxs("tr",{children:[e.jsx("td",{className:"px-4 py-2",children:"Subtotal:"}),e.jsx("td",{className:"px-4 py-2 text-right",children:Math.round(((V=a.pricing)==null?void 0:V.subtotal)||0)})]}),((_=a.pricing)==null?void 0:_.taxAmount)>0&&e.jsxs("tr",{children:[e.jsx("td",{className:"px-4 py-2",children:"Tax:"}),e.jsx("td",{className:"px-4 py-2 text-right",children:Math.round(a.pricing.taxAmount)})]}),((q=a.pricing)==null?void 0:q.discountAmount)>0&&e.jsxs("tr",{children:[e.jsx("td",{className:"px-4 py-2",children:"Discount:"}),e.jsx("td",{className:"px-4 py-2 text-right",children:Math.round(a.pricing.discountAmount)})]}),e.jsxs("tr",{className:"border-t-2 border-gray-900",children:[e.jsx("td",{className:"px-4 py-2 font-bold",children:"Total:"}),e.jsx("td",{className:"px-4 py-2 text-right font-bold",children:Math.round(((O=a.pricing)==null?void 0:O.total)||0)})]})]})})})}),e.jsxs("div",{className:"mt-8 text-center text-sm text-gray-500",children:["Generated on ",new Date().toLocaleDateString()," at ",new Date().toLocaleTimeString()]})]})})})]})};export{We as PurchaseInvoices};
