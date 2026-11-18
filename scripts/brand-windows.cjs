const fs=require('node:fs/promises');
const {NtExecutable,NtExecutableResource,Data,Resource}=require('resedit');

async function brandWindows(source,destination,iconPath,pkg){
 // Only the copied release executable is edited. Its resources are regenerated unsigned.
 const executable=NtExecutable.from(await fs.readFile(source),{ignoreCert:true});
 const resources=NtExecutableResource.from(executable);
 const icon=Data.IconFile.from(await fs.readFile(iconPath));
 const groups=Resource.IconGroupEntry.fromEntries(resources.entries);
 if(!groups.length)throw new Error('Electron executable has no icon group.');
 for(const group of groups){
  Resource.IconGroupEntry.replaceIconsForResource(resources.entries,group.id,group.lang,icon.icons.map(item=>item.data));
 }
 const versions=Resource.VersionInfo.fromEntries(resources.entries);
 if(!versions.length)throw new Error('Electron executable has no version information.');
 const [major,minor,patch]=pkg.version.split('.').map(Number);
 for(const version of versions){
  for(const language of version.getAvailableLanguages()){
   version.setFileVersion(major,minor,patch,0,language.lang);
   version.setProductVersion(major,minor,patch,0,language.lang);
   version.setStringValues(language,{
    ProductName:pkg.productName,FileDescription:pkg.productName,
    InternalName:pkg.name,OriginalFilename:pkg.productName+'.exe',
    CompanyName:pkg.productName,LegalCopyright:''
   });
  }
  version.outputToResourceEntries(resources.entries);
 }
 resources.outputResource(executable);
 await fs.writeFile(destination,Buffer.from(executable.generate()));
}
module.exports={brandWindows};
