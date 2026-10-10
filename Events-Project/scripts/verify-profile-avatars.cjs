const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
let failed=null;
function load(file){const m={exports:{}}; const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new Function('require','module','exports',js)(name=>{
 if(name==='./ProfilePhotoViewer')return {ProfilePhotoViewer:props=>props.children};
 if(name==='react')return {useState:()=>[failed,value=>{failed=value}]};
 if(name==='next/image')return {__esModule:true,default:props=>({image:true,props})};
 if(name==='@/lib/utils')return {cn:(...classes)=>classes.filter(Boolean).join(' ')};
 if(name==='@/lib/profileMediaUrl')return load('lib/profileMediaUrl.ts');
 return require(name);
},m,m.exports);return m.exports;}
const {ProfileAvatar}=load('components/MyComponents/ProfileAvatar.tsx');
const asset='12345678-1234-1234-1234-123456789012';
function render(src){const child=ProfileAvatar({src,name:'Ana Maria',size:48,className:'size-12'});return child.type(child.props);}
for(const src of ['https://lh3.googleusercontent.com/photo','/uploads/photo.png','/v1/media/profile/'+asset,'https://other.invalid/photo.jpg']){
 failed=null;let element=render(src);assert.equal(element.props.referrerPolicy,'no-referrer');assert.ok(element.props.onError);element.props.onError();element=render(src);assert.equal(element.type,'span');assert.equal(element.props.children.props.children,'AM');
}
for(const src of [null,'','invalid source','javascript:alert(1)']){failed=null;const element=render(src);assert.equal(element.type,'span');assert.equal(element.props.children.props.children,'AM');}
failed=null;assert.equal(render('/v1/media/events/'+asset).props.unoptimized,true);
failed=null;const preview=ProfileAvatar({src:'/v1/media/profile/'+asset,name:'Ana Maria',size:48,preview:true});const viewer=preview.type(preview.props);assert.equal(viewer.props.src,'/api/profile-media/'+asset);assert.equal(viewer.props.label,'Foto de perfil de Ana Maria');assert.equal(viewer.props.children.props.referrerPolicy,'no-referrer');
console.log('PASS: avatar sources, image error to initials, empty/invalid fallback, referrer policy and authenticated media bypassing optimizer');
