import type { APIConfig } from "@apihive/core";

export const endpointParamsConfig : Record<string, Record<string, { values : any[] }>> = {
    userById : {
        userId : {
            values : [1,2,3,4,5,6,7,8,9,10]
        }
    },
    postById : {
        postId : {
            values : [1,2,3,4,5,6,7,8,9,10]
        }
    }
}

const apiConfig : APIConfig = {
    name : 'default',
    endpoints : {
        userById : {
            target : 'https://jsonplaceholder.typicode.com/users/{{userId}}',
            meta : {
                cache: 30
            },
            method : 'GET'
        },
        postById : {
            target : 'https://jsonplaceholder.typicode.com/posts/{{postId}}',
            method : 'GET'
        }
    }
}

export default apiConfig;
