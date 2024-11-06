import { Constants } from "../common";
import { RUCapPerOperationExceededErrorCode } from "../request/RUCapPerOperationExceededError";
import { GroupByEndpointComponent } from "./EndpointComponent/GroupByEndpointComponent";
import { GroupByValueEndpointComponent } from "./EndpointComponent/GroupByValueEndpointComponent";
import { NonStreamingOrderByDistinctEndpointComponent } from "./EndpointComponent/NonStreamingOrderByDistinctEndpointComponent";
import { NonStreamingOrderByEndpointComponent } from "./EndpointComponent/NonStreamingOrderByEndpointComponent";
import { OffsetLimitEndpointComponent } from "./EndpointComponent/OffsetLimitEndpointComponent";
import { OrderByEndpointComponent } from "./EndpointComponent/OrderByEndpointComponent";
import { OrderedDistinctEndpointComponent } from "./EndpointComponent/OrderedDistinctEndpointComponent";
import { UnorderedDistinctEndpointComponent } from "./EndpointComponent/UnorderedDistinctEndpointComponent";
import { getInitialHeader, mergeHeaders } from "./headerUtils";
import { OrderByQueryExecutionContext } from "./orderByQueryExecutionContext";
import { ParallelQueryExecutionContext } from "./parallelQueryExecutionContext";
/** @hidden */
export class PipelinedQueryExecutionContext {
    constructor(clientContext, collectionLink, query, options, partitionedQueryExecutionInfo) {
        this.clientContext = clientContext;
        this.collectionLink = collectionLink;
        this.query = query;
        this.options = options;
        this.partitionedQueryExecutionInfo = partitionedQueryExecutionInfo;
        this.vectorSearchBufferSize = 0;
        this.nonStreamingOrderBy = false;
        this.endpoint = null;
        this.pageSize = options["maxItemCount"];
        if (this.pageSize === undefined) {
            this.pageSize = PipelinedQueryExecutionContext.DEFAULT_PAGE_SIZE;
        }
        // Pick between Nonstreaming and streaming endpoints
        this.nonStreamingOrderBy = partitionedQueryExecutionInfo.queryInfo.hasNonStreamingOrderBy;
        // Pick between parallel vs order by execution context
        const sortOrders = partitionedQueryExecutionInfo.queryInfo.orderBy;
        // TODO: Currently we don't get any field from backend to determine streaming queries
        if (this.nonStreamingOrderBy) {
            this.vectorSearchBufferSize = this.calculateVectorSearchBufferSize(partitionedQueryExecutionInfo.queryInfo, options);
            const distinctType = partitionedQueryExecutionInfo.queryInfo.distinctType;
            const context = new ParallelQueryExecutionContext(this.clientContext, this.collectionLink, this.query, this.options, this.partitionedQueryExecutionInfo);
            if (distinctType === "None") {
                this.endpoint = new NonStreamingOrderByEndpointComponent(context, sortOrders, this.vectorSearchBufferSize, partitionedQueryExecutionInfo.queryInfo.offset);
            }
            else {
                this.endpoint = new NonStreamingOrderByDistinctEndpointComponent(context, partitionedQueryExecutionInfo.queryInfo, this.vectorSearchBufferSize);
            }
        }
        else {
            if (Array.isArray(sortOrders) && sortOrders.length > 0) {
                // Need to wrap orderby execution context in endpoint component, since the data is nested as a \
                //      "payload" property.
                this.endpoint = new OrderByEndpointComponent(new OrderByQueryExecutionContext(this.clientContext, this.collectionLink, this.query, this.options, this.partitionedQueryExecutionInfo));
            }
            else {
                this.endpoint = new ParallelQueryExecutionContext(this.clientContext, this.collectionLink, this.query, this.options, this.partitionedQueryExecutionInfo);
            }
            if (Object.keys(partitionedQueryExecutionInfo.queryInfo.groupByAliasToAggregateType).length >
                0 ||
                (partitionedQueryExecutionInfo.queryInfo.aggregates !=null && partitionedQueryExecutionInfo.queryInfo.aggregates.length > 0) ||
                partitionedQueryExecutionInfo.queryInfo.groupByExpressions.length > 0) {
                if (partitionedQueryExecutionInfo.queryInfo.hasSelectValue) {
                    this.endpoint = new GroupByValueEndpointComponent(this.endpoint, partitionedQueryExecutionInfo.queryInfo);
                }
                else {
                    this.endpoint = new GroupByEndpointComponent(this.endpoint, partitionedQueryExecutionInfo.queryInfo);
                }
            }
            // If top then add that to the pipeline. TOP N is effectively OFFSET 0 LIMIT N
            const top = partitionedQueryExecutionInfo.queryInfo.top;
            if (typeof top === "number") {
                this.endpoint = new OffsetLimitEndpointComponent(this.endpoint, 0, top);
            }
            // If offset+limit then add that to the pipeline
            const limit = partitionedQueryExecutionInfo.queryInfo.limit;
            const offset = partitionedQueryExecutionInfo.queryInfo.offset;
            if (typeof limit === "number" && typeof offset === "number") {
                this.endpoint = new OffsetLimitEndpointComponent(this.endpoint, offset, limit);
            }
            // If distinct then add that to the pipeline
            const distinctType = partitionedQueryExecutionInfo.queryInfo.distinctType;
            if (distinctType === "Ordered") {
                this.endpoint = new OrderedDistinctEndpointComponent(this.endpoint);
            }
            if (distinctType === "Unordered") {
                this.endpoint = new UnorderedDistinctEndpointComponent(this.endpoint);
            }
        }
    }
    async nextItem(diagnosticNode, operationOptions, ruConsumedManager) {
        return this.endpoint.nextItem(diagnosticNode, operationOptions, ruConsumedManager);
    }
    // Removed callback here beacuse it wouldn't have ever worked...
    hasMoreResults() {
        return this.endpoint.hasMoreResults();
    }
    async fetchMore(diagnosticNode, operationOptions, ruConsumedManager) {
        // if the wrapped endpoint has different implementation for fetchMore use that
        // otherwise use the default implementation
        if (typeof this.endpoint.fetchMore === "function") {
            return this.endpoint.fetchMore(diagnosticNode, operationOptions, ruConsumedManager);
        }
        else {
            this.fetchBuffer = [];
            this.fetchMoreRespHeaders = getInitialHeader();
            return this.nonStreamingOrderBy
                ? this._nonStreamingFetchMoreImplementation(diagnosticNode, operationOptions, ruConsumedManager)
                : this._fetchMoreImplementation(diagnosticNode, operationOptions, ruConsumedManager);
        }
    }
    async _fetchMoreImplementation(diagnosticNode, operationOptions, ruConsumedManager) {
        try {
            const { result: item, headers } = await this.endpoint.nextItem(diagnosticNode, operationOptions, ruConsumedManager);
            mergeHeaders(this.fetchMoreRespHeaders, headers);
            if (item === undefined) {
                // no more results
                if (this.fetchBuffer.length === 0) {
                    return {
                        result: undefined,
                        headers: this.fetchMoreRespHeaders,
                    };
                }
                else {
                    // Just give what we have
                    const temp = this.fetchBuffer;
                    this.fetchBuffer = [];
                    return { result: temp, headers: this.fetchMoreRespHeaders };
                }
            }
            else {
                this.fetchBuffer.push(item);
                if (this.fetchBuffer.length >= this.pageSize) {
                    // fetched enough results
                    const temp = this.fetchBuffer.slice(0, this.pageSize);
                    this.fetchBuffer = this.fetchBuffer.splice(this.pageSize);
                    return { result: temp, headers: this.fetchMoreRespHeaders };
                }
                else {
                    // recursively fetch more
                    // TODO: is recursion a good idea?
                    return this._fetchMoreImplementation(diagnosticNode, operationOptions, ruConsumedManager);
                }
            }
        }
        catch (err) {
            mergeHeaders(this.fetchMoreRespHeaders, err.headers);
            err.headers = this.fetchMoreRespHeaders;
            if (err.code === RUCapPerOperationExceededErrorCode && err.fetchedResults) {
                err.fetchedResults.push(...this.fetchBuffer);
            }
            if (err) {
                throw err;
            }
        }
    }
    async _nonStreamingFetchMoreImplementation(diagnosticNode, operationOptions, ruConsumedManager) {
        try {
            const { result: item, headers } = await this.endpoint.nextItem(diagnosticNode, operationOptions, ruConsumedManager);
            mergeHeaders(this.fetchMoreRespHeaders, headers);
            if (item === undefined) {
                // no more results
                if (this.fetchBuffer.length === 0) {
                    return {
                        result: undefined,
                        headers: this.fetchMoreRespHeaders,
                    };
                }
                else {
                    // Just give what we have
                    const temp = this.fetchBuffer;
                    this.fetchBuffer = [];
                    return { result: temp, headers: this.fetchMoreRespHeaders };
                }
            }
            else {
                const ruConsumed = await ruConsumedManager.getRUConsumed();
                const maxRUAllowed = operationOptions && operationOptions.ruCapPerOperation
                    ? operationOptions.ruCapPerOperation
                    : Constants.NonStreamingQueryDefaultRUThreshold;
                // append the result
                if (typeof item !== "object") {
                    this.fetchBuffer.push(item);
                }
                else if (Object.keys(item).length !== 0) {
                    this.fetchBuffer.push(item);
                }
                if (this.fetchBuffer.length >= this.pageSize) {
                    // fetched enough results
                    const temp = this.fetchBuffer.slice(0, this.pageSize);
                    this.fetchBuffer = this.fetchBuffer.splice(this.pageSize);
                    return { result: temp, headers: this.fetchMoreRespHeaders };
                }
                else if (ruConsumed * 2 < maxRUAllowed) {
                    // recursively fetch more only if we have more than 50% RUs left.
                    return this._nonStreamingFetchMoreImplementation(diagnosticNode, operationOptions, ruConsumedManager);
                }
                else {
                    return { result: [], headers: this.fetchMoreRespHeaders };
                }
            }
        }
        catch (err) {
            mergeHeaders(this.fetchMoreRespHeaders, err.headers);
            err.headers = this.fetchMoreRespHeaders;
            if (err.code === RUCapPerOperationExceededErrorCode && err.fetchedResults) {
                err.fetchedResults.push(...this.fetchBuffer);
            }
            if (err) {
                throw err;
            }
        }
    }
    calculateVectorSearchBufferSize(queryInfo, options) {
        if (queryInfo.top === 0 || queryInfo.limit === 0)
            return 0;
        return queryInfo.top
            ? queryInfo.top
            : queryInfo.limit
                ? queryInfo.offset + queryInfo.limit
                : options["vectorSearchBufferSize"] && options["vectorSearchBufferSize"] > 0
                    ? options["vectorSearchBufferSize"]
                    : PipelinedQueryExecutionContext.DEFAULT_VECTOR_SEARCH_BUFFER_SIZE;
    }
}
PipelinedQueryExecutionContext.DEFAULT_PAGE_SIZE = 10;
PipelinedQueryExecutionContext.DEFAULT_VECTOR_SEARCH_BUFFER_SIZE = 2000;
//# sourceMappingURL=pipelinedQueryExecutionContext.js.map