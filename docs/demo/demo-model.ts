import { reactive } from 'vue';

export default reactive<{
    fetchCount : number,
    runServiceCount : number,
    result : any,
    currentEndpoint : string,
    currentEndpointParams : Record<string, any>,
    expirations : Record<string, number>,
    currentRequestHash : string
}>({
    fetchCount : 0,
    runServiceCount : 0,
    result : null,
    currentEndpoint : 'userById',
    currentEndpointParams : { userId : 1 },
    expirations : {},
    currentRequestHash : ''
});    
