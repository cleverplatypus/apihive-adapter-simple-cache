import { HTTPRequestFactory } from '@apihive/core';
import adaptersFeature from '@apihive/core/features/adapters';
import { watch } from 'vue';
import SimpleRequestCacheAdapter from '../../src';
import apiConfig, { endpointParamsConfig } from './api-config';
import model from './demo-model';


export default class DemoController {
    private factory : HTTPRequestFactory;

    constructor() {
        const globalFetch = fetch;
        (globalThis as any).fetch = (url, init) => {
            model.fetchCount++;
            return globalFetch(url, init);
        };
        this.factory = new HTTPRequestFactory()
            .withAPIConfig(apiConfig)
            .use(adaptersFeature);

        this.factory.withAdapter(new SimpleRequestCacheAdapter());

        watch(() => [model.currentEndpoint, model.currentEndpointParams], () => {
            model.currentRequestHash = '';
            model.fetchCount = 0;
            model.runServiceCount = 0;
            model.result = null;
        }, { deep : true });

       
    }

    get endpoints() {
        return Object.keys(apiConfig.endpoints);
    }
    
    get endpointParams() {
        return endpointParamsConfig[model.currentEndpoint];
    }
    
    async runService(name : string, params : Record<string, any>, body? : Record<string, any>) {
        const fetches = model.fetchCount;

        const request = 
            this.factory.createAPIRequest(name)
            .withResponseBodyTransformers(async (response) => {
                model.runServiceCount++;
                return response;
            })
        if(Object.keys(params).length) {
            request.withURLParams(params);
        }
        if(body && Object.keys(body).length) {
            request.withJSONBody(body);
        }
        const response = await request.execute();
        const hash = request.getHash();
        model.currentRequestHash = hash;
        model.result = response;
        if(fetches < model.fetchCount) {
            model.expirations[hash] = Date.now() + apiConfig.endpoints[name]!.meta!.cache! * 1000;
        }
    }
}

