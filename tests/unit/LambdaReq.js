import should from 'should'
import sinon from 'sinon'
import LambdaReq, { LambdaReqError } from '../../src/index'

describe('LambdaReq', () => {

  const API_GATEWAY_EVENT = {
    httpMethod: 'GET',
    resource: '/v1/test',
    headers: {
      'Content-Type': 'application/json'
    },
    queryStringParameters: {
      name: 'john'
    },
    pathParameters: {
      id: 'u-123'
    },
    body: '{"active":true}'
  }

  const TASK_EVENT = {
    task: 'taskName',
    params: {
      id: 'u-123'
    }
  }
  
  it('inits with a lambda event object', () => {
    const event = null
    const callback = sinon.stub()
    const context = {}
    should(()=> new LambdaReq(event, context, callback))
    .throw(/Malformed Lambda event object/)
  })

  it('inits with a lambda callback', () => {
    const event = {}
    const callback = null
    const context = {}
    should(()=> new LambdaReq(event, callback, context))
    .throw(/Malformed Lambda callback/)
  })

  describe('invoke', () => {

    describe('for an APIGateway request', () => {
      
      it('responds', () => {
        const callback = sinon.stub()
        const handler = sinon.stub().returns({ success: true })
        const lambda = new LambdaReq(API_GATEWAY_EVENT, {}, callback)
        lambda.get('/v1/test', handler)
        lambda.invoke()
        should(handler.calledWith(
          { params: { name: 'john', id: 'u-123', active: true },
            headers: { 'Content-Type': 'application/json' }
          },
          API_GATEWAY_EVENT
        )).eql(true)
        should(callback.getCall(0).args[1]).containEql({
          body: '{"success":true}'
        })
      })

      describe('when the handler result is a promise', () => {
        it('waits for the promise to resolve then it responds', () => {
          const callback = sinon.stub()
          const handler = sinon.stub().returns(Promise.resolve({ success: true }))
          const lambda = new LambdaReq(API_GATEWAY_EVENT, {}, callback)
          lambda.get('/v1/test', handler)
          return lambda.invoke()
          .then(()=> {
            should(handler.calledWith(
              { params: { name: 'john', id: 'u-123', active: true },
                headers: { 'Content-Type': 'application/json' }
              },
              API_GATEWAY_EVENT
            )).eql(true)
            should(callback.getCall(0).args[1]).containEql({
              body: '{"success":true}'
            })
          })
        })
      })

      describe('when the handler throws an unhandled exception', () => {
        it('responds with a status 500', () => {
          const callback = sinon.stub()
          const handler = ()=> { throw new Error('Unhandled exception.') }
          const lambda = new LambdaReq(API_GATEWAY_EVENT, {}, callback)
          lambda.get('/v1/test', handler)
          lambda.invoke()
          should(callback.getCall(0).args[1]).containEql({
            statusCode: 500,
            body: '{}'
          })
        })
      })

      describe('when the handler throws a LambdaReqError', () => {
        it('responds with an error', () => {
          const callback = sinon.stub()
          const lambdaReqError = new LambdaReqError({
            message: {
              error: 'Invalid data',
              code: 'invalidUserData',
              data: {
                email: 'malformed'
              }
            },
            status: 401
          })
          const handler = ()=> { throw lambdaReqError }
          const lambda = new LambdaReq(API_GATEWAY_EVENT, {}, callback)
          lambda.get('/v1/test', handler)
          lambda.invoke()
          should(callback.getCall(0).args[1]).containEql({
            statusCode: 401,
            body: '{"error":"Invalid data","code":"invalidUserData","data":{"email":"malformed"}}'
          })
        })
      })
    
    })

    describe('for a TASK request', () => {
      
      it('responds', () => {
        const callback = sinon.stub()
        const handler = sinon.stub().returns({ success: true })
        const lambda = new LambdaReq(TASK_EVENT, {}, callback)
        lambda.task('taskName', handler)
        lambda.invoke()
        should(handler.calledWith(
          { params: { id: 'u-123' }, headers: undefined },
          TASK_EVENT
        )).eql(true)
        should(callback.getCall(0).args[1]).containEql('{"success":true}')
      })

      describe('when the handler throws an exception', () => {
        it('errors', () => {
          const callback = sinon.stub()
          const taskError = new Error('Unhandled exception.')
          const handler = ()=> { throw taskError }
          const lambda = new LambdaReq(TASK_EVENT, {}, callback)
          lambda.task('taskName', handler)
          lambda.invoke()
          should(callback.getCall(0).args[0]).eql(taskError)
        })
      })

    })

    describe('when there is no valid route handler', () => {
      it('responds with a 404 error', () => {
        const event = { httpMethod: 'GET', body: '{}' }
        const callback = sinon.stub()
        const lambda = new LambdaReq(event, {}, callback)
        lambda.invoke()
        should(callback.getCall(0).args[1]).containEql({
          statusCode: 404,
          body: '{"error":"Unhandled route: GET_undefined"}'
        })
      })
    })
  })

  describe('isApiGateway', () => {
    describe('when it has a httpMethod set on event', () => {
      it('returns true', () => {
        const event = { httpMethod: 'GET' }
        const callback = sinon.stub()
        const lambda = new LambdaReq(event, {}, callback)
        lambda.isApiGateway.should.eql(true)
      })
    })
    describe('when it has no httpMethod set on event', () => {
      it('returns false', () => {
        const event = {}
        const callback = sinon.stub()
        const lambda = new LambdaReq(event, {}, callback)
        lambda.isApiGateway.should.eql(false)
      })
    })
  })

  describe('isTask', () => {
    describe('when it has a task property set on event', () => {
      it('returns true', () => {
        const event = { task: 'test' }
        const callback = sinon.stub()
        const lambda = new LambdaReq(event, {}, callback)
        lambda.isTask.should.eql(true)
      })
    })
    describe('when it has no task property set on event', () => {
      it('returns false', () => {
        const event = {}
        const callback = sinon.stub()
        const lambda = new LambdaReq(event, {}, callback)
        lambda.isTask.should.eql(false)
      })
    })
  })

  describe('params', () => {
    describe('for APIGateway requests', () => {
      it('returns merged params', () => {
        const callback = sinon.stub()
        const lambda = new LambdaReq(API_GATEWAY_EVENT, {}, callback)
        lambda.params.should.eql({ name: 'john', id: 'u-123', active: true })
      })
    })

    describe('for tasks', () => {
      it('returns params', () => {
        const callback = sinon.stub()
        const lambda = new LambdaReq(TASK_EVENT, {}, callback)
        lambda.params.should.eql({ id: 'u-123' })
      })
    })
  })

  describe('params', () => {
    describe('for APIGateway requests', () => {
      it('returns the request headers', () => {
        const callback = sinon.stub()
        const lambda = new LambdaReq(API_GATEWAY_EVENT, {}, callback)
        lambda.headers.should.eql({ 'Content-Type': 'application/json' })
      })
    })
  })

  describe('currentRoute', () => {
    describe('for APIGateway requests', () => {
      it('returns the route ID', () => {
        const callback = sinon.stub()
        const lambda = new LambdaReq(API_GATEWAY_EVENT, {}, callback)
        lambda.currentRoute.should.eql('GET_/v1/test')
      })
    })

    describe('for tasks', () => {
      it('returns the route ID', () => {
        const callback = sinon.stub()
        const lambda = new LambdaReq(TASK_EVENT, {}, callback)
        lambda.currentRoute.should.eql('TASK_taskName')
      })
    })
  })

  describe('route binders', () => {
    const PATH = '/v1/test'
    const VALID_BINDERS = [
      'get', 'post', 'put', 'delete', 'options', 'task'
    ]

    for (const binder of VALID_BINDERS) {
      it(`binds a ${binder} request handler`, () => {
        const callback = sinon.stub()
        const handler = sinon.stub()
        const lambda = new LambdaReq({}, {}, callback)
        lambda[binder](PATH, handler)
        lambda._routes[`${binder.toUpperCase()}_${PATH}`].should.eql(handler)
      })
    }
  })

})