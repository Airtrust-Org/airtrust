/** Fail-closed export assembler. Page-number pagination has no server snapshot:
 * never present a full CSV when totals or attempt identities drift between
 * requests. The final first-page reread additionally catches late insertions.
 * Identity belongs to the tenant-scoped Worker attempt, not a made-up UI key.
 */
export type ExamExportItem={attemptId?:string};
export type ExamExportPage<T extends ExamExportItem>={
 page:number;limit:number;total:number;pages:number;items:T[];
};
export class ExamExportIntegrity<T extends ExamExportItem>{
 private readonly seen=new Set<string>();
 private readonly firstPageIds:string[]=[];
 private readonly rows:T[]=[];
 constructor(private readonly total:number,private readonly pages:number,private readonly limit:number){
  if(!Number.isSafeInteger(total)||total<1||!Number.isSafeInteger(pages)||pages<1||
     !Number.isSafeInteger(limit)||limit<1)throw Error('EXAM_EXPORT_INVALID_SCOPE');
 }
 add(page:ExamExportPage<T>):void{
  const expectedPage=Math.floor(this.rows.length/this.limit)+1;
  if(page.page!==expectedPage||page.total!==this.total||page.pages!==this.pages||
     page.limit!==this.limit||page.items.length>this.limit){
   throw Error('EXAM_EXPORT_SCOPE_CHANGED');
  }
  for(const row of page.items){
   if(!row.attemptId||this.seen.has(row.attemptId))throw Error('EXAM_EXPORT_DUPLICATE_OR_MISSING_ID');
   this.seen.add(row.attemptId);
   this.rows.push(row);
   if(page.page===1)this.firstPageIds.push(row.attemptId);
  }
 }
 checkFinalPage(first:ExamExportPage<T>):void{
  if(this.rows.length!==this.total||this.seen.size!==this.total||
     first.page!==1||first.limit!==this.limit||first.total!==this.total||
     first.pages!==this.pages||
     first.items.map(x=>x.attemptId).join('\u0000')!==this.firstPageIds.join('\u0000')){
    throw Error('EXAM_EXPORT_DATA_DRIFT');
  }
 }
 items():readonly T[]{return this.rows;}
}
