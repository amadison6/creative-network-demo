// Data-only parity logic shared by the staging API and offline verifier.
const rows=(obj,key)=>(Array.isArray(obj?.[key])?obj[key]:[]).map(v=>Object.fromEntries(Object.entries(v).map(([k,x])=>[k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),x])));
const value=v=>v===true?'1':v===false?'0':String(v??'');
export function compareWorkState(source,target,profileIds=null) {
  const failures=[],s={},t={},counts={source:{},target:{}};
  const specs={
    hubs:'id title summary color priority archived revision createdAt updatedAt archivedAt',
    projects:'id hubId title summary area goalId parentProjectId color priority archived revision createdAt updatedAt archivedAt',
    tasks:'id displayId hubId projectId parentTaskId title designation status priority area goalId milestoneId microDone classificationStatus classificationConfidence proposedDesignation proposedParentTaskId flowPhase flowOrder durationEstimate timingType earliestStart targetDate dueText dueDate timingNote nextAction waitingOn notes source todayRank effort revision lastChangeSource createdAt updatedAt completedAt archivedAt',
    taskPeople:'taskId profileId role createdAt',dependencies:'taskId dependsOnTaskId dependencyType createdAt',
    resources:'id taskId label url resourceType externalId metadataJson createdAt updatedAt',
    sourceAliases:'sourceName sourceRecordId canonicalTaskId sourceStatus sourceRevision sourceTitleHash lastSeenAt'
  };
  const keys={taskPeople:['taskId','profileId'],dependencies:['taskId','dependsOnTaskId'],sourceAliases:['sourceName','sourceRecordId']};
  const fail=(entity,id,type,extra={})=>failures.push({entity,id,type,...extra});
  for(const [entity,fields]of Object.entries(specs)) {
    s[entity]=rows(source,entity);t[entity]=rows(target,entity);
    counts.source[entity]=s[entity].length;counts.target[entity]=t[entity].length;
    const identity=keys[entity]||['id'];
    const index=(rs,side)=>{const m=new Map();for(const r of rs){const id=JSON.stringify(identity.map(k=>value(r[k])));if(identity.some(k=>!value(r[k])))fail(entity,id,'missing-identity',{side});if(m.has(id))fail(entity,id,'duplicate-identity',{side});m.set(id,r);}return m;};
    const sm=index(s[entity],'source'),tm=index(t[entity],'target');
    for(const [id,a]of sm){const b=tm.get(id);if(!b){fail(entity,id,'missing');continue;}for(const field of fields.split(' '))if(value(a[field])!==value(b[field]))fail(entity,id,'field-mismatch',{field});}
    for(const id of tm.keys())if(!sm.has(id))fail(entity,id,'extra');
  }
  const hubs=new Map(t.hubs.map(x=>[x.id,x])),projects=new Map(t.projects.map(x=>[x.id,x])),tasks=new Map(t.tasks.map(x=>[x.id,x]));
  const profiles=profileIds==null?null:new Set(profileIds),displayIds=new Set();
  for(const p of t.projects){if(!hubs.has(p.hubId))fail('projects',p.id,'orphan-hub');if(p.parentProjectId&&!projects.has(p.parentProjectId))fail('projects',p.id,'orphan-parent');}
  for(const task of t.tasks) {
    if(!String(task.id).startsWith('task_'))fail('tasks',task.id,'noncanonical-id');
    if(!hubs.has(task.hubId))fail('tasks',task.id,'orphan-hub');
    if(!projects.has(task.projectId))fail('tasks',task.id,'orphan-project');
    else if(projects.get(task.projectId).hubId!==task.hubId)fail('tasks',task.id,'project-hub-mismatch');
    if(task.displayId&&displayIds.has(task.displayId))fail('tasks',task.id,'duplicate-display-id');displayIds.add(task.displayId);
    for(const field of ['parentTaskId','proposedParentTaskId'])if(task[field]){if(!tasks.has(task[field]))fail('tasks',task.id,'orphan-parent',{field});else if(tasks.get(task[field]).designation==='micro')fail('tasks',task.id,'micro-parent-is-micro',{field});if(task[field]===task.id)fail('tasks',task.id,'self-parent',{field});}
    if(source.batchId&&task.migrationBatchId&&task.migrationBatchId!==source.batchId)fail('tasks',task.id,'wrong-batch');
  }
  for(const p of t.taskPeople){if(!tasks.has(p.taskId))fail('taskPeople',p.taskId,'orphan-task');if(profiles&&!profiles.has(p.profileId))fail('taskPeople',p.taskId,'unknown-profile',{profileId:p.profileId});}
  for(const d of t.dependencies){if(!tasks.has(d.taskId)||!tasks.has(d.dependsOnTaskId))fail('dependencies',d.taskId,'orphan-dependency');if(d.taskId===d.dependsOnTaskId)fail('dependencies',d.taskId,'self-dependency');}
  for(const r of t.resources)if(!tasks.has(r.taskId))fail('resources',r.id,'orphan-task');
  for(const a of t.sourceAliases){if(!tasks.has(a.canonicalTaskId))fail('sourceAliases',a.sourceRecordId,'orphan-alias');if(a.sourceName==='task-manager'&&tasks.get(a.canonicalTaskId)?.displayId!==a.sourceRecordId)fail('sourceAliases',a.sourceRecordId,'display-alias-mismatch');}
  function cycles(entity,nodes,edges){const g=new Map(nodes.map(x=>[x.id,[]]));for(const [a,b]of edges)if(g.has(a)&&g.has(b))g.get(a).push(b);const visiting=new Set(),done=new Set();function visit(id){if(visiting.has(id))return true;if(done.has(id))return false;visiting.add(id);for(const n of g.get(id)||[])if(visit(n))return true;visiting.delete(id);done.add(id);return false;}for(const id of g.keys())if(visit(id)){fail(entity,id,'cycle');break;}}
  cycles('projects',t.projects,t.projects.filter(x=>x.parentProjectId).map(x=>[x.id,x.parentProjectId]));
  cycles('parents',t.tasks,t.tasks.flatMap(x=>[x.parentTaskId,x.proposedParentTaskId].filter(Boolean).map(p=>[x.id,p])));
  cycles('dependencies',t.tasks,t.dependencies.map(x=>[x.taskId,x.dependsOnTaskId]));
  const identitySetMatches=!failures.some(x=>['missing','extra','duplicate-identity','missing-identity'].includes(x.type));
  return {summary:{pass:failures.length===0,...counts,identitySetMatches,validationFailures:failures.length},failures};
}
