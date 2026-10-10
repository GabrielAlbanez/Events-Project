const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),ts=require('typescript'),postcss=require('postcss');
const base='3ecadff'; const path='components/MyComponents/home/';
function previous(file){return cp.execFileSync('git',['show',base+':Events-Project/'+file],{encoding:'utf8'});}
function source(file){return fs.readFileSync(file,'utf8');}
const printer=ts.createPrinter({removeComments:true});
function calls(text,names){const file=ts.createSourceFile('x.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),values=[];function visit(n){if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&names.includes(n.expression.text))values.push(printer.printNode(ts.EmitHint.Unspecified,n,file));ts.forEachChild(n,visit);}visit(file);return values;}
const agenda=path+'LoggedHomeAgenda.tsx';assert.deepEqual(calls(source(agenda),['useEffect','useMemo','fetch']),calls(previous(agenda),['useEffect','useMemo','fetch']),'Agenda data, authentication, registration requests and effects preserved');
for(const file of ['app/page.tsx',path+'useLoggedHomeData.ts',path+'HomePresentation.tsx','app/globals.css','tailwind.config.ts','lib/personalAgenda.ts','lib/eventRecommendations.ts','components/MyComponents/CheckInPass.tsx'])assert.equal(source(file).replace(/\r\n/g,'\n'),previous(file).replace(/\r\n/g,'\n'),file+' preserved');
function lights(css){const result=[];postcss.parse(css).walkRules(rule=>{if(/\.(beams|sparks|floor|orb|orbSecondary|bob)\b|\.hero::before/.test(rule.selector))result.push({selector:rule.selector,values:rule.nodes.map(n=>n.toString())});});return result;}
assert.deepEqual(lights(source(path+'LoggedHomeScroll.module.css')),lights(previous(path+'LoggedHomeScroll.module.css')),'All hero lighting and bob rules preserved');
const current=source(agenda);assert.ok(current.includes('upcoming.filter(event => values[event.id] === "CONFIRMED")'),'Check-in remains confirmed-only');
assert.ok(!/data:image|className=.*qr|QRCode/.test(current),'No artificial check-in codes');
console.log('PASS: unchanged data effects, registration requests, confirmed-only check-in, visitor home, real map page, tokens, assets flow and exact hero lighting');

// Touch depth remains progressive: every keyframe supplies its own perspective.
const scrollCss=postcss.parse(source(path+'LoggedHomeScroll.module.css'));
const baselineScrollCss=postcss.parse(previous(path+'LoggedHomeScroll.module.css'));
function declarations(rule){return rule.nodes.filter(node=>node.type==='decl').map(node=>[node.prop,node.value,node.important]);}
function rulesFor(css,selector){const rules=[];css.walkRules(selector,rule=>rules.push(declarations(rule)));return rules;}
assert.deepEqual(rulesFor(scrollCss,'.ring'),rulesFor(baselineScrollCss,'.ring'),'Carousel scroll-snap, overflow, padding and desktop transforms unchanged');
const depthFrames=[];scrollCss.walkAtRules('keyframes',rule=>{if(rule.params==='carouselDepth')depthFrames.push(rule);});
assert.equal(depthFrames.length,1,'One carousel depth keyframe definition');
assert.deepEqual(depthFrames[0].nodes.map(frame=>frame.selector),['0%','50%','100%']);
for(const frame of depthFrames[0].nodes){const transforms=frame.nodes.filter(node=>node.type==='decl'&&node.prop==='transform');assert.equal(transforms.length,1);assert.match(transforms[0].value,/^perspective\(800px\) rotateY\(-?\d+deg\) scale\([.\d]+\)$/,'Every depth frame includes perspective, existing tilt and scale');}
const touchAnimations=[];scrollCss.walkRules('.ringCard',rule=>{if(rule.nodes.some(node=>node.prop==='animation-timeline'&&node.value==='view(inline)'))touchAnimations.push(rule);});
assert.equal(touchAnimations.length,1);
const ancestors=[];for(let parent=touchAnimations[0].parent;parent;parent=parent.parent)if(parent.type==='atrule')ancestors.push([parent.name,parent.params]);
assert.ok(ancestors.some(([name,params])=>name==='supports'&&params==='(animation-timeline: view(inline))'),'Touch carousel remains feature gated');
assert.ok(ancestors.some(([name,params])=>name==='media'&&params==='(prefers-reduced-motion:no-preference)'),'Touch carousel respects reduced motion');
assert.ok(ancestors.some(([name,params])=>name==='media'&&params==='(max-width:1099px), (pointer:coarse), (hover:none)'),'Touch depth does not replace desktop ring');
console.log('PASS: carousel perspective in all keyframes, scroll-snap preserved, unsupported/reduced-motion fallbacks preserved');
const agendaCss=postcss.parse(source(path+'LoggedHomeAgenda.module.css'));

const ticketAnimations=[];agendaCss.walkRules('.ticket[data-ticket]',rule=>{if(rule.nodes.some(node=>node.prop==='animation-timeline'&&node.value==='view(block)'))ticketAnimations.push(rule);});
assert.equal(ticketAnimations.length,1,'Touch ticket animation targets real tickets only');
const ticketAncestors=[];for(let parent=ticketAnimations[0].parent;parent;parent=parent.parent)if(parent.type==='atrule')ticketAncestors.push([parent.name,parent.params]);
assert.ok(ticketAncestors.some(([name,params])=>name==='supports'&&params==='(animation-timeline: view(block))'));
assert.ok(ticketAncestors.some(([name,params])=>name==='media'&&params==='(prefers-reduced-motion:no-preference)'));
assert.ok(ticketAncestors.some(([name,params])=>name==='media'&&params==='(max-width:1099px), (pointer:coarse), (hover:none)'));
assert.ok(ticketAnimations[0].nodes.some(node=>node.prop==='animation-range'&&node.value==='entry 0% entry 100%'),'Tickets settle after entry');
const ticketFrames=[];agendaCss.walkAtRules('keyframes',rule=>{if(rule.params==='touchTicketDepth')ticketFrames.push(rule);});
assert.equal(ticketFrames.length,1);assert.equal(ticketFrames[0].nodes.length,2);
for(const frame of ticketFrames[0].nodes){assert.ok(frame.nodes.every(node=>node.type==='decl'&&['transform','opacity'].includes(node.prop)),'Touch ticket frames animate only transform/opacity');assert.ok(frame.nodes.some(node=>node.prop==='opacity'&&node.value==='1'),'Tickets never become invisible');assert.ok(frame.nodes.some(node=>node.prop==='transform'&&node.value.startsWith('perspective(800px)')));}
assert.ok(rulesFor(agendaCss,'.ticket[data-ticket]:focus-within').some(values=>values.some(([prop,value])=>prop==='animation'&&value==='none')&&values.some(([prop,value])=>prop==='transform'&&value==='none')),'Focused ticket remains stable');
const reducedTickets=[];agendaCss.walkRules('.ticket',rule=>{let parent=rule.parent;while(parent){if(parent.type==='atrule'&&parent.name==='media'&&parent.params==='(prefers-reduced-motion:reduce)')reducedTickets.push(declarations(rule));parent=parent.parent;}});
assert.ok(reducedTickets.some(values=>values.some(([prop,value,important])=>prop==='transform'&&value==='none'&&important)&&values.some(([prop,value,important])=>prop==='animation'&&value==='none'&&important)),'Reduced motion is static');
const ticketLayout=rulesFor(agendaCss,'.ticket');assert.ok(ticketLayout.every(values=>!values.some(([prop,value])=>prop==='animation-timeline'||(prop==='animation'&&value!=='none'))),'Unsupported browsers have no ticket animation');
for(const selector of ['.stub a','.main h3 a'])assert.deepEqual(rulesFor(agendaCss,selector),rulesFor(postcss.parse(cp.execFileSync('git',['show','601546f:Events-Project/'+path+'LoggedHomeAgenda.module.css'],{encoding:'utf8'})),selector),'44px targets remain unchanged');
console.log('PASS: progressive touch ticket depth, visible static fallbacks, focus stability and unchanged touch targets');