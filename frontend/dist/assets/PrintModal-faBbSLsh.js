import{r as f,p as i,X as un}from"./index-DaTQeIrM.js";import{u as xn}from"./useCompanyInfo-x6rWwbVQ.js";import{P as hn}from"./printer-sSBWtYCz.js";const fn=({isOpen:h,onClose:V,orderData:n,companyInfo:c,documentTitle:W="Invoice",partyLabel:d="Customer"})=>{var A,P,C,S,a,T,z,k,$,L,q,B,M,E,F,G,H;const g=f.useRef(null),{companyInfo:_}=xn(),l=W||"Invoice";f.useEffect(()=>(h?document.body.style.overflow="hidden":document.body.style.overflow="unset",()=>{document.body.style.overflow="unset"}),[h]);const U=s=>new Date(s||new Date).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}),Q=s=>new Date(s||new Date).toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:!0}),m=s=>s==null||isNaN(s)?"-":Number(s).toLocaleString(void 0,{minimumFractionDigits:0,maximumFractionDigits:2}),p=(s,e=0)=>{if(s==null)return e;const t=typeof s=="number"?s:parseFloat(s);return Number.isFinite(t)?t:e},x=(s,e="N/A")=>s&&String(s).trim()!==""?s:e,X=(d==null?void 0:d.toLowerCase())==="supplier"?"Supplier":"Bill To",Y=_.companyName||(c==null?void 0:c.name)||"Your Company Name",J=l,y=_.address||(c==null?void 0:c.address)||"",N=_.contactNumber||(c==null?void 0:c.phone)||"",u=f.useMemo(()=>{var t,o;if(!n)return{name:"Walk-in Customer",email:"N/A",phone:"N/A",extra:""};const s=n.customerInfo||n.customer||n.supplier||{};return{name:s.displayName||s.businessName||s.name||(s.firstName||s.lastName?`${s.firstName||""} ${s.lastName||""}`.trim():"")||"Walk-in Customer",email:s.email||"N/A",phone:s.phone||"N/A",extra:s.companyName||((t=n.customerInfo)==null?void 0:t.businessName)||((o=n.customer)==null?void 0:o.businessName)||""}},[n]),b=Array.isArray(n==null?void 0:n.items)?n.items:[],j=((A=n==null?void 0:n.pricing)==null?void 0:A.subtotal)??(n==null?void 0:n.subtotal)??b.reduce((s,e)=>{const t=p(e.quantity??e.qty,0),o=p(e.unitPrice??e.price??e.unitCost??e.rate,0);return s+t*o},0),v=((P=n==null?void 0:n.pricing)==null?void 0:P.discountAmount)??(n==null?void 0:n.discount)??((C=n==null?void 0:n.pricing)==null?void 0:C.discount)??0,w=((S=n==null?void 0:n.pricing)==null?void 0:S.taxAmount)??(n==null?void 0:n.tax)??((a=n==null?void 0:n.pricing)!=null&&a.isTaxExempt,0),K=((T=n==null?void 0:n.pricing)==null?void 0:T.total)??(n==null?void 0:n.total)??j-p(v)+p(w),r=(n==null?void 0:n.invoiceNumber)||(n==null?void 0:n.orderNumber)||(n==null?void 0:n.poNumber)||(n==null?void 0:n.referenceNumber)||(n==null?void 0:n._id)||"N/A",Z=(n==null?void 0:n.status)||(n==null?void 0:n.orderStatus)||(n==null?void 0:n.invoiceStatus)||((z=n==null?void 0:n.payment)==null?void 0:z.status)||"Pending",O=(n==null?void 0:n.orderType)||(n==null?void 0:n.type)||l,D=((k=n==null?void 0:n.payment)==null?void 0:k.status)||(($=n==null?void 0:n.payment)!=null&&$.isPartialPayment?"Partial":((L=n==null?void 0:n.payment)==null?void 0:L.remainingBalance)>0?"Pending":(q=n==null?void 0:n.payment)!=null&&q.amountPaid?"Paid":(B=n==null?void 0:n.payment)!=null&&B.method?"Pending":"N/A"),nn=((M=n==null?void 0:n.payment)==null?void 0:M.method)||"N/A",sn=((E=n==null?void 0:n.payment)==null?void 0:E.amountPaid)??((F=n==null?void 0:n.pricing)==null?void 0:F.total)??(n==null?void 0:n.total)??0,en=new Date;l.toLowerCase().includes("order")?`${l}`:l.toLowerCase().includes("purchase")&&`${l}`;const tn=[u.name,u.extra||null,u.email!=="N/A"?u.email:null,u.phone!=="N/A"?u.phone:null,((G=n==null?void 0:n.customerInfo)==null?void 0:G.address)||null].filter(Boolean),cn=[{label:"Invoice #:",value:x(r)},{label:"Date:",value:U((n==null?void 0:n.createdAt)||(n==null?void 0:n.invoiceDate))},{label:"Status:",value:x(Z)},{label:"Type:",value:x(O)}],ln=[{label:"Status:",value:x(D)},{label:"Method:",value:x(nn)},{label:"Amount:",value:m(sn)}],mn=()=>{const s=g.current,e=window.open("","_blank");e.document.write(`
      <html>
        <head>
          <title>${l} - ${r}</title>
          <style>
            @media print {
              @page {
                size: A4;
                margin: 0.4in;
              }
              body {
                font-family: 'Inter', Arial, sans-serif;
                font-size: 12px;
                color: #111827;
                margin: 0;
                padding: 0;
                background: #f5f6fb;
              }
              .print-preview-scale {
                transform: none !important;
              }
              .print-document {
                width: 100%;
                max-width: 100%;
                box-shadow: none;
                border-radius: 0;
                padding: 24px 28px;
              }
              .print-document__company-name {
                font-size: 28px;
              }
            }
            .print-preview-scale {
              width: 100%;
            }
            .print-document {
              width: 900px;
              background: #fff;
              border-radius: 18px;
              padding: 32px 36px 28px;
              box-shadow: 0 20px 45px rgba(15, 23, 42, 0.18);
              font-family: 'Inter', 'Segoe UI', sans-serif;
            }
            .print-document__title {
              font-size: 18px;
              font-weight: 600;
              color: #111827;
              margin-bottom: 12px;
            }
            .print-document__company {
              text-align: center;
              margin-bottom: 28px;
            }
            .print-document__company-name {
              font-size: 30px;
              font-weight: 700;
              margin-bottom: 4px;
            }
            .print-document__company-subtitle {
              font-size: 16px;
              color: #6b7280;
            }
            .print-document__info-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
              gap: 24px;
              margin-bottom: 28px;
            }
            .print-document__info-section {
              border-top: 2px solid #e5e7eb;
              padding-top: 12px;
            }
            .print-document__info-title {
              font-size: 12px;
              font-weight: 600;
              color: #6b7280;
              letter-spacing: 0.08em;
              text-transform: uppercase;
              margin-bottom: 10px;
            }
            .print-document__info-row {
              font-size: 13px;
              color: #111827;
              margin-bottom: 6px;
              display: flex;
              justify-content: space-between;
            }
            .print-document__info-label {
              font-weight: 500;
              color: #374151;
            }
            .print-document__info-value {
              text-align: right;
              max-width: 65%;
            }
            .print-document__table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 10px;
            }
            .print-document__table th {
              background: #f3f4f6;
              border: 1px solid #e5e7eb;
              text-align: left;
              padding: 10px;
              font-size: 13px;
              font-weight: 600;
              color: #111827;
            }
            .print-document__table td {
              border: 1px solid #e5e7eb;
              padding: 10px;
              font-size: 13px;
              color: #374151;
            }
            .print-document__summary {
              margin-top: 24px;
              display: flex;
              justify-content: flex-end;
            }
            .print-document__summary-table {
              width: 260px;
            }
            .print-document__summary-row {
              display: flex;
              justify-content: space-between;
              font-size: 14px;
              margin-bottom: 6px;
              color: #111827;
            }
            .print-document__summary-row--total {
              border-top: 1px solid #e5e7eb;
              padding-top: 8px;
              margin-top: 6px;
              font-weight: 700;
              font-size: 16px;
            }
            .print-document__footer {
              margin-top: 24px;
              text-align: center;
              color: #6b7280;
              font-size: 12px;
            }
            .print-document__footer span {
              display: block;
            }
          </style>
        </head>
        <body>
          ${s.innerHTML}
        </body>
      </html>
    `),e.document.close(),e.focus(),setTimeout(()=>{e.print(),e.close()},250)};if(!h||!n)return null;const pn=`${l} Details`;return i.jsx("div",{className:"fixed inset-0 bg-black bg-opacity-50 z-50 p-4 overflow-hidden",children:i.jsx("div",{className:"w-full h-full overflow-auto flex items-center justify-center",children:i.jsx("div",{className:"bg-transparent w-full max-w-[95vw] max-h-[92vh] flex flex-col items-center",children:i.jsx("div",{className:"p-4 print-preview-wrapper w-full",children:i.jsx("div",{ref:g,className:"print-preview-scale",children:i.jsxs("div",{className:"print-document",children:[i.jsxs("div",{className:"print-document__toolbar",children:[i.jsx("h2",{className:"print-document__heading",children:pn}),i.jsxs("div",{className:"flex items-center space-x-2",children:[i.jsxs("button",{onClick:mn,className:"btn btn-success btn-md flex items-center space-x-2 px-4",children:[i.jsx(hn,{className:"h-4 w-4"}),i.jsx("span",{children:"Print"})]}),i.jsxs("button",{onClick:V,className:"btn btn-secondary-outline btn-md flex items-center space-x-2 px-4 text-gray-700 border border-gray-300 hover:bg-gray-100",children:[i.jsx(un,{className:"h-4 w-4"}),i.jsx("span",{children:"Close"})]})]})]}),i.jsxs("div",{className:"print-document__company",children:[i.jsx("div",{className:"print-document__company-name",children:Y}),i.jsx("div",{className:"print-document__company-subtitle",children:J})]}),i.jsxs("div",{className:"print-document__info-grid",children:[i.jsxs("div",{className:"print-document__info-block",children:[i.jsxs("div",{className:"print-document__section-label",children:[X,":"]}),tn.map((s,e)=>i.jsx("div",{className:"print-document__info-line print-document__info-line--stack",children:s},`bill-${e}`))]}),i.jsxs("div",{className:"print-document__info-block",children:[i.jsx("div",{className:"print-document__section-label",children:"Invoice Details:"}),cn.map((s,e)=>i.jsxs("div",{className:"print-document__info-line",children:[i.jsx("span",{className:"print-document__info-label",children:s.label}),i.jsx("span",{className:"print-document__info-value",children:s.value})]},`inv-${e}`))]}),i.jsxs("div",{className:"print-document__info-block",children:[i.jsx("div",{className:"print-document__section-label",children:"Payment:"}),ln.map((s,e)=>i.jsxs("div",{className:"print-document__info-line",children:[i.jsx("span",{className:"print-document__info-label",children:s.label}),i.jsx("span",{className:"print-document__info-value",children:s.value})]},`pay-${e}`))]})]}),i.jsx("div",{className:"print-document__section-label mt-6",children:"Items:"}),i.jsxs("table",{className:"print-document__table mt-3",children:[i.jsx("thead",{children:i.jsxs("tr",{children:[i.jsx("th",{children:"Item"}),i.jsx("th",{children:"Description"}),i.jsx("th",{children:"Qty"}),i.jsx("th",{children:"Price"}),i.jsx("th",{children:"Total"})]})}),i.jsxs("tbody",{children:[b.length===0&&i.jsx("tr",{children:i.jsx("td",{colSpan:"5",style:{textAlign:"center"},children:"No items available"})}),b.map((s,e)=>{var I,R;const t=p(s.quantity??s.qty,0),o=p(s.unitPrice??s.price??s.unitCost??s.rate,0),on=p(s.total??s.lineTotal,t*o);return i.jsxs("tr",{children:[i.jsx("td",{children:((I=s.product)==null?void 0:I.name)||s.name||`Item ${e+1}`}),i.jsx("td",{children:((R=s.product)==null?void 0:R.description)||s.description||s.notes||"—"}),i.jsx("td",{children:m(t)}),i.jsx("td",{children:m(o)}),i.jsx("td",{children:m(on)})]},e)})]})]}),i.jsx("div",{className:"print-document__summary",children:i.jsxs("div",{className:"print-document__summary-table",children:[i.jsxs("div",{className:"print-document__summary-row",children:[i.jsx("span",{children:"Subtotal"}),i.jsx("span",{children:m(j)})]}),i.jsxs("div",{className:"print-document__summary-row",children:[i.jsx("span",{children:"Tax"}),i.jsx("span",{children:m(w)})]}),i.jsxs("div",{className:"print-document__summary-row",children:[i.jsx("span",{children:"Discount"}),i.jsx("span",{children:m(v)})]}),i.jsxs("div",{className:"print-document__summary-row print-document__summary-row--total",children:[i.jsx("span",{children:"Total"}),i.jsx("span",{children:m(K)})]})]})}),i.jsxs("div",{className:"print-document__footer",children:[i.jsxs("div",{className:"print-document__generated",children:["Generated on ",Q(en),"  •  Printed by"," ",((H=n==null?void 0:n.createdBy)==null?void 0:H.name)||"Current User"]}),y&&i.jsx("span",{children:y}),N&&i.jsxs("span",{children:["Phone: ",N]})]})]})})})})})})};export{fn as P};
