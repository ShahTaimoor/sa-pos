import{r as l,d as Te,y as z,p as e,S as et,aH as Fe,Q as R,az as Be,a2 as Oe,bS as Qe,O as _e}from"./index-QHzcgHe1.js";import{c as tt,d as st,e as rt}from"./accountLedgerApi-CM1trl4Z.js";import{u as at}from"./suppliersApi-TtAmQji1.js";import{P as nt}from"./printer-Dmqc0NC_.js";import{D as lt}from"./download-ULFDWFy_.js";import{C as Ge}from"./chevron-down-oX_1uWoZ.js";const ut=()=>{var D,U,q,H,V,W,Y,J,K,X,Z,T,ee,te,se,re,ae,ne,le,ie,oe,ce,de,xe,me,he,pe,ge,ue,ye,fe,be,je,Ne,we,ve,Ce,Se,ke,Le,Ae;const b=(()=>{const t=new Date,s=new Date;return s.setMonth(t.getMonth()-1),{startDate:s.toISOString().split("T")[0],endDate:t.toISOString().split("T")[0]}})(),[i,$]=l.useState(""),[v,j]=l.useState(!1),[y,C]=l.useState(""),S=l.useRef(null),[m,F]=l.useState(""),[k,N]=l.useState(!1),[f,L]=l.useState(""),A=l.useRef(null),P=l.useRef(null),[n,B]=l.useState({startDate:b.startDate,endDate:b.endDate,search:""});l.useEffect(()=>{const t=s=>{S.current&&!S.current.contains(s.target)&&j(!1),A.current&&!A.current.contains(s.target)&&N(!1)};return(v||k)&&document.addEventListener("mousedown",t),()=>{document.removeEventListener("mousedown",t)}},[v,k]);const{data:p,isLoading:ot}=Te({search:y,limit:100},{refetchOnMountOrArgChange:!0}),I=l.useMemo(()=>{var t;return((t=p==null?void 0:p.data)==null?void 0:t.customers)||(p==null?void 0:p.customers)||(p==null?void 0:p.data)||p||[]},[p]),{data:g,isLoading:ct}=at({search:f,limit:100},{refetchOnMountOrArgChange:!0}),M=l.useMemo(()=>{var t;return((t=g==null?void 0:g.data)==null?void 0:t.suppliers)||(g==null?void 0:g.suppliers)||(g==null?void 0:g.data)||g||[]},[g]),De=l.useMemo(()=>{const t={...n};return i&&(t.customerId=i),m&&(t.supplierId=m),t},[n,i,m]),{data:o,isLoading:Ue,error:qe,refetch:He}=tt(De,{onError:t=>z(t,"Error fetching ledger summary")}),{data:r,isLoading:Ve}=st({customerId:i,startDate:n.startDate,endDate:n.endDate},{skip:!i,onError:t=>z(t,"Error fetching detailed transactions")}),{data:a,isLoading:We}=rt({supplierId:m,startDate:n.startDate,endDate:n.endDate},{skip:!m,onError:t=>z(t,"Error fetching detailed supplier transactions")}),O=((U=(D=o==null?void 0:o.data)==null?void 0:D.customers)==null?void 0:U.summary)||[],Q=((H=(q=o==null?void 0:o.data)==null?void 0:q.suppliers)==null?void 0:H.summary)||[];(W=(V=o==null?void 0:o.data)==null?void 0:V.customers)!=null&&W.totals,(J=(Y=o==null?void 0:o.data)==null?void 0:Y.suppliers)!=null&&J.totals;const w=((K=o==null?void 0:o.data)==null?void 0:K.period)||{};l.useMemo(()=>i?O.filter(t=>{var d,x;const s=((d=t.id)==null?void 0:d.toString())||((x=t._id)==null?void 0:x.toString()),h=i.toString();return s===h}):[],[O,i]);const _=l.useMemo(()=>{if(!y.trim())return I.slice(0,50);const t=y.toLowerCase();return I.filter(s=>{const h=(s.businessName||s.name||"").toLowerCase(),d=(s.email||"").toLowerCase(),x=(s.phone||"").toLowerCase();return h.includes(t)||d.includes(t)||x.includes(t)}).slice(0,50)},[I,y]);l.useMemo(()=>m?Q.filter(t=>{var d,x;const s=((d=t.id)==null?void 0:d.toString())||((x=t._id)==null?void 0:x.toString()),h=m.toString();return s===h}):[],[Q,m]);const G=l.useMemo(()=>{if(!f.trim())return M.slice(0,50);const t=f.toLowerCase();return M.filter(s=>{const h=(s.companyName||s.name||"").toLowerCase(),d=(s.email||"").toLowerCase(),x=(s.phone||"").toLowerCase();return h.includes(t)||d.includes(t)||x.includes(t)}).slice(0,50)},[M,f]),E=(t,s)=>{B({...n,[t]:s})},Ye=()=>{B({startDate:b.startDate,endDate:b.endDate,search:""}),$(""),C(""),F(""),L("")},Je=t=>{$(t._id),C(t.businessName||t.name||""),j(!1)},Ke=t=>{F(t._id),L(t.companyName||t.name||""),N(!1)},c=t=>new Intl.NumberFormat("en-US",{minimumFractionDigits:0,maximumFractionDigits:0}).format(t||0),u=t=>{if(!t)return"";const s=new Date(t),h=s.getDate().toString().padStart(2,"0"),d=s.toLocaleDateString("en-US",{month:"short"}),x=s.getFullYear().toString().slice(-2);return`${h}-${d}-${x}`},Xe=()=>{_e.info("Export functionality coming soon")},Ze=()=>{var x,Pe,Ie,Me,Ee,ze,Re,$e;const t=P.current;if(!t){_e.error("No content to print. Please select a customer or supplier.");return}const s=window.open("","_blank"),h=i?((Pe=(x=r==null?void 0:r.data)==null?void 0:x.customer)==null?void 0:Pe.name)||"Customer Receivables":((Me=(Ie=a==null?void 0:a.data)==null?void 0:Ie.supplier)==null?void 0:Me.name)||"Supplier Payables",d=i?((ze=(Ee=r==null?void 0:r.data)==null?void 0:Ee.customer)==null?void 0:ze.accountCode)||"":(($e=(Re=a==null?void 0:a.data)==null?void 0:Re.supplier)==null?void 0:$e.accountCode)||"";s.document.write(`
      <html>
        <head>
          <title>Account Ledger Summary - ${h}</title>
          <style>
            @media print {
              @page {
                size: A4 landscape;
                margin: 0.5in;
              }
              body {
                font-family: 'Inter', Arial, sans-serif;
                font-size: 11px;
                color: #111827;
                margin: 0;
                padding: 0;
              }
            }
            body {
              font-family: 'Inter', Arial, sans-serif;
              font-size: 12px;
              color: #111827;
              margin: 20px;
            }
            .print-header {
              text-align: center;
              margin-bottom: 20px;
              border-bottom: 2px solid #e5e7eb;
              padding-bottom: 15px;
            }
            .print-header h1 {
              font-size: 24px;
              font-weight: 700;
              margin: 0 0 5px 0;
              color: #111827;
            }
            .print-header p {
              font-size: 14px;
              color: #6b7280;
              margin: 5px 0;
            }
            .print-info {
              margin-bottom: 20px;
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 15px;
            }
            .print-info-item {
              font-size: 12px;
            }
            .print-info-label {
              font-weight: 600;
              color: #374151;
            }
            .print-info-value {
              color: #111827;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 15px;
            }
            th {
              background: #f3f4f6;
              border: 1px solid #e5e7eb;
              text-align: left;
              padding: 8px;
              font-size: 11px;
              font-weight: 600;
              color: #111827;
            }
            td {
              border: 1px solid #e5e7eb;
              padding: 8px;
              font-size: 11px;
              color: #374151;
            }
            .text-right {
              text-align: right;
            }
            .text-center {
              text-align: center;
            }
            .font-bold {
              font-weight: 700;
            }
            .bg-gray-50 {
              background-color: #f9fafb;
            }
            .bg-gray-100 {
              background-color: #f3f4f6;
            }
            .print-footer {
              margin-top: 30px;
              text-align: center;
              color: #6b7280;
              font-size: 11px;
              border-top: 1px solid #e5e7eb;
              padding-top: 15px;
            }
          </style>
        </head>
        <body>
          <div class="print-header">
            <h1>Account Ledger Summary</h1>
            <p>${h}${d?` - Account Code: ${d}`:""}</p>
            <p>Period: ${u(n.startDate)} to ${u(n.endDate)}</p>
          </div>
          ${t.innerHTML}
          <div class="print-footer">
            <p>Generated on ${new Date().toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</p>
          </div>
        </body>
      </html>
    `),s.document.close(),s.focus(),setTimeout(()=>{s.print(),s.close()},250)};return qe?e.jsx("div",{className:"flex justify-center items-center h-64",children:e.jsxs("div",{className:"text-center",children:[e.jsx("p",{className:"text-red-600 mb-4",children:"Error loading ledger summary"}),e.jsx("button",{onClick:()=>He(),className:"btn btn-primary",children:"Retry"})]})}):e.jsxs("div",{className:"space-y-6",children:[e.jsxs("div",{className:"flex justify-between items-center",children:[e.jsxs("div",{children:[e.jsx("h1",{className:"text-3xl font-bold text-gray-900",children:"Account Ledger Summary"}),e.jsx("p",{className:"text-gray-600 mt-1",children:"Customer Receivables and Supplier Payables"})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsxs("button",{onClick:Ze,className:"btn btn-secondary flex items-center gap-2",disabled:!i&&!m,title:!i&&!m?"Please select a customer or supplier to print":"Print ledger summary",children:[e.jsx(nt,{className:"h-4 w-4"}),"Print"]}),e.jsxs("button",{onClick:Xe,className:"btn btn-secondary flex items-center gap-2",children:[e.jsx(lt,{className:"h-4 w-4"}),"Export"]})]})]}),e.jsxs("div",{className:"bg-white border border-gray-200 rounded-lg p-4 shadow-sm",children:[e.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-6 gap-4",children:[e.jsxs("div",{className:"relative",ref:S,children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:"Select Customer"}),e.jsxs("div",{className:"relative",children:[e.jsx("input",{type:"text",placeholder:"Select customer...",value:y,onChange:t=>{C(t.target.value),j(!0)},onFocus:()=>j(!0),className:"input w-full"}),e.jsx(Ge,{className:"absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none"}),v&&_.length>0&&e.jsx("div",{className:"absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto",children:_.map(t=>{const s=t.businessName||t.name||"Unknown Customer";return e.jsxs("button",{onClick:()=>Je(t),className:`w-full text-left px-4 py-2 hover:bg-gray-50 ${i===t._id?"bg-blue-50":""}`,children:[e.jsx("div",{className:"text-sm font-medium text-gray-900",children:s}),t.email&&e.jsx("div",{className:"text-xs text-gray-500",children:t.email})]},t._id)})})]})]}),e.jsxs("div",{className:"relative",ref:A,children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:"Select Supplier"}),e.jsxs("div",{className:"relative",children:[e.jsx("input",{type:"text",placeholder:"Select supplier...",value:f,onChange:t=>{L(t.target.value),N(!0)},onFocus:()=>N(!0),className:"input w-full"}),e.jsx(Ge,{className:"absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none"}),k&&G.length>0&&e.jsx("div",{className:"absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto",children:G.map(t=>{const s=t.companyName||t.name||"Unknown Supplier";return e.jsxs("button",{onClick:()=>Ke(t),className:`w-full text-left px-4 py-2 hover:bg-gray-50 ${m===t._id?"bg-blue-50":""}`,children:[e.jsx("div",{className:"text-sm font-medium text-gray-900",children:s}),t.email&&e.jsx("div",{className:"text-xs text-gray-500",children:t.email})]},t._id)})})]})]}),e.jsxs("div",{className:"relative",children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:"Search"}),e.jsxs("div",{className:"relative",children:[e.jsx(et,{className:"absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400"}),e.jsx("input",{type:"text",placeholder:"Search by name, email, phone...",value:n.search,onChange:t=>E("search",t.target.value),className:"input w-full pl-10"})]})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:"From Date"}),e.jsxs("div",{className:"relative",children:[e.jsx(Fe,{className:"absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400"}),e.jsx("input",{type:"date",value:n.startDate,onChange:t=>E("startDate",t.target.value),className:"input w-full pl-10"})]})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:"To Date"}),e.jsxs("div",{className:"relative",children:[e.jsx(Fe,{className:"absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400"}),e.jsx("input",{type:"date",value:n.endDate,onChange:t=>E("endDate",t.target.value),className:"input w-full pl-10"})]})]}),e.jsx("div",{className:"flex items-end",children:e.jsx("button",{onClick:Ye,className:"btn btn-outline w-full",children:"Clear Filters"})})]}),w.startDate&&w.endDate&&e.jsxs("div",{className:"mt-4 text-sm text-gray-600",children:[e.jsx("span",{className:"font-medium",children:"Period:"})," ",u(w.startDate)," to ",u(w.endDate)]})]}),Ue?e.jsx("div",{className:"flex justify-center items-center h-64",children:e.jsx(R,{})}):e.jsxs("div",{className:"space-y-6",children:[i?e.jsxs("div",{className:"bg-white border border-gray-200 rounded-lg shadow-sm",children:[e.jsx("div",{className:"bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b border-gray-200",children:e.jsx("div",{className:"flex items-center justify-between",children:e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx(Be,{className:"h-6 w-6 text-blue-600"}),e.jsxs("div",{children:[e.jsx("h2",{className:"text-xl font-bold text-gray-900",children:((Z=(X=r==null?void 0:r.data)==null?void 0:X.customer)==null?void 0:Z.name)||"Customer Receivables"}),e.jsxs("p",{className:"text-sm text-gray-600",children:["Account Code: ",((ee=(T=r==null?void 0:r.data)==null?void 0:T.customer)==null?void 0:ee.accountCode)||""]}),n.startDate&&n.endDate&&e.jsxs("p",{className:"text-xs text-gray-500 mt-1",children:["Period: ",u(n.startDate)," to ",u(n.endDate)]})]})]})})}),Ve?e.jsx("div",{className:"flex justify-center items-center py-12",children:e.jsx(R,{})}):e.jsx("div",{className:"overflow-x-auto",ref:i?P:null,children:e.jsxs("table",{className:"min-w-full divide-y divide-gray-200",children:[e.jsx("thead",{className:"bg-gray-50",children:e.jsxs("tr",{children:[e.jsx("th",{className:"px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider",children:"Date"}),e.jsx("th",{className:"px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider",children:"Voucher No"}),e.jsx("th",{className:"px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider",children:"Particular"}),e.jsx("th",{className:"px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider",children:"Debits"}),e.jsx("th",{className:"px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider",children:"Credits"}),e.jsx("th",{className:"px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider",children:"Balance"})]})}),e.jsxs("tbody",{className:"bg-white divide-y divide-gray-200",children:[e.jsxs("tr",{className:"bg-gray-50",children:[e.jsx("td",{className:"px-4 py-3 text-sm text-gray-900"}),e.jsx("td",{className:"px-4 py-3 text-sm text-gray-900"}),e.jsx("td",{className:"px-4 py-3 text-sm font-medium text-gray-900",children:"Opening Balance:"}),e.jsx("td",{className:"px-4 py-3 text-sm text-right text-gray-900"}),e.jsx("td",{className:"px-4 py-3 text-sm text-right text-gray-900"}),e.jsx("td",{className:"px-4 py-3 text-sm text-right font-bold text-gray-900",children:c(((te=r==null?void 0:r.data)==null?void 0:te.openingBalance)||0)})]}),((re=(se=r==null?void 0:r.data)==null?void 0:se.entries)==null?void 0:re.length)===0?e.jsx("tr",{children:e.jsxs("td",{colSpan:"6",className:"px-4 py-8 text-center text-gray-500",children:[e.jsx(Oe,{className:"h-8 w-8 mx-auto mb-2 text-gray-400"}),e.jsx("p",{children:"No transactions found for this period"})]})}):(ne=(ae=r==null?void 0:r.data)==null?void 0:ae.entries)==null?void 0:ne.map((t,s)=>e.jsxs("tr",{className:"hover:bg-gray-50 transition-colors",children:[e.jsx("td",{className:"px-4 py-3 text-sm text-gray-900",children:u(t.date)}),e.jsx("td",{className:"px-4 py-3 text-sm text-gray-900",children:t.voucherNo||"-"}),e.jsx("td",{className:"px-4 py-3 text-sm text-gray-900",children:t.particular||"-"}),e.jsx("td",{className:"px-4 py-3 text-sm text-right text-gray-900",children:t.debitAmount>0?c(t.debitAmount):"-"}),e.jsx("td",{className:"px-4 py-3 text-sm text-right text-gray-900",children:t.creditAmount>0?c(t.creditAmount):"-"}),e.jsx("td",{className:"px-4 py-3 text-sm text-right font-semibold text-gray-900",children:c(Math.abs(t.balance||0))})]},s)),((ie=(le=r==null?void 0:r.data)==null?void 0:le.entries)==null?void 0:ie.length)>0&&e.jsxs("tr",{className:"bg-gray-100 font-bold",children:[e.jsx("td",{className:"px-4 py-3 text-sm text-gray-900"}),e.jsx("td",{className:"px-4 py-3 text-sm text-gray-900"}),e.jsx("td",{className:"px-4 py-3 text-sm text-gray-900",children:"Total"}),e.jsx("td",{className:"px-4 py-3 text-sm text-right text-gray-900",children:c(((ce=(oe=r==null?void 0:r.data)==null?void 0:oe.entries)==null?void 0:ce.reduce((t,s)=>t+(s.debitAmount||0),0))||0)}),e.jsx("td",{className:"px-4 py-3 text-sm text-right text-gray-900",children:c(((xe=(de=r==null?void 0:r.data)==null?void 0:de.entries)==null?void 0:xe.reduce((t,s)=>t+(s.creditAmount||0),0))||0)}),e.jsx("td",{className:"px-4 py-3 text-sm text-right text-gray-900",children:c(Math.abs(((me=r==null?void 0:r.data)==null?void 0:me.closingBalance)||0))})]})]})]})})]}):e.jsxs("div",{className:"bg-white border border-gray-200 rounded-lg shadow-sm p-12 text-center",children:[e.jsx(Be,{className:"h-12 w-12 text-gray-400 mx-auto mb-4"}),e.jsx("p",{className:"text-gray-500 text-lg",children:"Please select a customer from the dropdown above to view their ledger summary"})]}),m?e.jsxs("div",{className:"bg-white border border-gray-200 rounded-lg shadow-sm",children:[e.jsx("div",{className:"bg-gradient-to-r from-orange-50 to-orange-100 px-6 py-4 border-b border-gray-200",children:e.jsx("div",{className:"flex items-center justify-between",children:e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx(Qe,{className:"h-6 w-6 text-orange-600"}),e.jsxs("div",{children:[e.jsx("h2",{className:"text-xl font-bold text-gray-900",children:((pe=(he=a==null?void 0:a.data)==null?void 0:he.supplier)==null?void 0:pe.name)||"Supplier Payables"}),e.jsxs("p",{className:"text-sm text-gray-600",children:["Account Code: ",((ue=(ge=a==null?void 0:a.data)==null?void 0:ge.supplier)==null?void 0:ue.accountCode)||""]}),n.startDate&&n.endDate&&e.jsxs("p",{className:"text-xs text-gray-500 mt-1",children:["Period: ",u(n.startDate)," to ",u(n.endDate)]})]})]})})}),We?e.jsx("div",{className:"flex justify-center items-center py-12",children:e.jsx(R,{})}):e.jsx("div",{className:"overflow-x-auto",ref:m&&!i?P:null,children:e.jsxs("table",{className:"min-w-full divide-y divide-gray-200",children:[e.jsx("thead",{className:"bg-gray-50",children:e.jsxs("tr",{children:[e.jsx("th",{className:"px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider",children:"Date"}),e.jsx("th",{className:"px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider",children:"Voucher No"}),e.jsx("th",{className:"px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider",children:"Particular"}),e.jsx("th",{className:"px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider",children:"Debits"}),e.jsx("th",{className:"px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider",children:"Credits"}),e.jsx("th",{className:"px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider",children:"Balance"})]})}),e.jsxs("tbody",{className:"bg-white divide-y divide-gray-200",children:[e.jsxs("tr",{className:"bg-gray-50",children:[e.jsx("td",{colSpan:"3",className:"px-4 py-3 text-sm font-medium text-gray-900",children:"Opening Balance:"}),e.jsx("td",{className:"px-4 py-3 text-sm text-right text-gray-900",children:"-"}),e.jsx("td",{className:"px-4 py-3 text-sm text-right text-gray-900",children:"-"}),e.jsx("td",{className:"px-4 py-3 text-sm text-right font-bold text-gray-900",children:c(((ye=a==null?void 0:a.data)==null?void 0:ye.openingBalance)||0)})]}),((be=(fe=a==null?void 0:a.data)==null?void 0:fe.entries)==null?void 0:be.length)===0?e.jsx("tr",{children:e.jsxs("td",{colSpan:"6",className:"px-4 py-8 text-center text-gray-500",children:[e.jsx(Oe,{className:"h-8 w-8 mx-auto mb-2 text-gray-400"}),e.jsx("p",{children:"No transactions found for this period"})]})}):(Ne=(je=a==null?void 0:a.data)==null?void 0:je.entries)==null?void 0:Ne.map((t,s)=>e.jsxs("tr",{className:"hover:bg-gray-50 transition-colors",children:[e.jsx("td",{className:"px-4 py-3 text-sm text-gray-900",children:u(t.date)}),e.jsx("td",{className:"px-4 py-3 text-sm text-gray-900",children:t.voucherNo||"-"}),e.jsx("td",{className:"px-4 py-3 text-sm text-gray-700 max-w-md whitespace-normal break-words",children:t.particular||"-"}),e.jsx("td",{className:"px-4 py-3 text-sm text-right text-gray-900",children:t.debitAmount>0?c(t.debitAmount):"-"}),e.jsx("td",{className:"px-4 py-3 text-sm text-right text-gray-900",children:t.creditAmount>0?c(t.creditAmount):"-"}),e.jsx("td",{className:"px-4 py-3 text-sm text-right font-semibold text-gray-900",children:c(Math.abs(t.balance||0))})]},s)),((ve=(we=a==null?void 0:a.data)==null?void 0:we.entries)==null?void 0:ve.length)>0&&e.jsxs("tr",{className:"bg-gray-100 font-bold",children:[e.jsx("td",{className:"px-4 py-3 text-sm text-gray-900"}),e.jsx("td",{className:"px-4 py-3 text-sm text-gray-900"}),e.jsx("td",{className:"px-4 py-3 text-sm text-gray-900",children:"Total"}),e.jsx("td",{className:"px-4 py-3 text-sm text-right text-gray-900",children:c(((Se=(Ce=a==null?void 0:a.data)==null?void 0:Ce.entries)==null?void 0:Se.reduce((t,s)=>t+(s.debitAmount||0),0))||0)}),e.jsx("td",{className:"px-4 py-3 text-sm text-right text-gray-900",children:c(((Le=(ke=a==null?void 0:a.data)==null?void 0:ke.entries)==null?void 0:Le.reduce((t,s)=>t+(s.creditAmount||0),0))||0)}),e.jsx("td",{className:"px-4 py-3 text-sm text-right text-gray-900",children:c(Math.abs(((Ae=a==null?void 0:a.data)==null?void 0:Ae.closingBalance)||0))})]})]})]})})]}):e.jsxs("div",{className:"bg-white border border-gray-200 rounded-lg shadow-sm p-12 text-center",children:[e.jsx(Qe,{className:"h-12 w-12 text-gray-400 mx-auto mb-4"}),e.jsx("p",{className:"text-gray-500 text-lg",children:"Please select a supplier from the dropdown above to view their ledger summary"})]})]})]})};export{ut as default};
