import * as React from 'react';
import { companies } from '../mock/companies';
const CompanyContext = React.createContext<{ companyId:string; setCompanyId:(id:string)=>void; companies: typeof companies }>({
  companyId: companies[0]!.id, setCompanyId: ()=>{}, companies
});
export const CompanyProvider: React.FC<{children:React.ReactNode}> = ({children})=>{
  const [companyId,setCompanyId] = React.useState(companies[0]!.id);
  return <CompanyContext.Provider value={{companyId,setCompanyId,companies}}>{children}</CompanyContext.Provider>;
};
export const useCompany = ()=> React.useContext(CompanyContext);
