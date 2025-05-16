/**
 * API Service for DataFed
 * This service provides a TypeScript wrapper around the DataFed API
 */

import {
    BaseRecord,
    DataRecord,
    CollectionRecord,
    ProjectRecord,
    User,
    ACL,
    SearchQuery,
    SearchResult,
    Task,
    ApiResponse
} from '../types/models';

/**
 * Base API class for handling HTTP requests
 */
class ApiService {
    private baseUrl: string;

    constructor(baseUrl: string = '') {
        this.baseUrl = baseUrl;
    }

    /**
     * Make a GET request to the API
     * @param url The URL to request
     * @param params Optional query parameters
     * @returns Promise with the response data
     */
    async get<T>(url: string, params?: Record<string, any>): Promise<ApiResponse<T>> {
        try {
            const queryString = params ? `?${new URLSearchParams(params).toString()}` : '';
            const response = await fetch(`${this.baseUrl}${url}${queryString}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
            });

            const data = await response.json();
            return data as ApiResponse<T>;
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /**
     * Make a POST request to the API
     * @param url The URL to request
     * @param body The request body
     * @returns Promise with the response data
     */
    async post<T>(url: string, body: any): Promise<ApiResponse<T>> {
        try {
            const response = await fetch(`${this.baseUrl}${url}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
                credentials: 'include',
            });

            const data = await response.json();
            return data as ApiResponse<T>;
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
}

/**
 * DataFed API service
 */
class DataFedApi extends ApiService {
    /**
     * Get current user information
     * @returns Promise with user data
     */
    async getCurrentUser(): Promise<ApiResponse<User>> {
        return this.get<User>('/api/user/current');
    }

    /**
     * Get user by ID
     * @param userId User ID
     * @param includeDetails Whether to include detailed information
     * @returns Promise with user data
     */
    async getUser(userId: string, includeDetails: boolean = false): Promise<ApiResponse<User>> {
        return this.get<User>(`/api/user/${userId}`, { details: includeDetails });
    }

    /**
     * Get data record by ID
     * @param recordId Record ID
     * @returns Promise with data record
     */
    async getDataRecord(recordId: string): Promise<ApiResponse<DataRecord>> {
        return this.get<DataRecord>(`/api/data/${recordId}`);
    }

    /**
     * Create a new data record
     * @param data Data record to create
     * @returns Promise with created data record
     */
    async createDataRecord(data: Partial<DataRecord>): Promise<ApiResponse<DataRecord>> {
        return this.post<DataRecord>('/api/data', data);
    }

    /**
     * Update a data record
     * @param recordId Record ID
     * @param data Data to update
     * @returns Promise with updated data record
     */
    async updateDataRecord(recordId: string, data: Partial<DataRecord>): Promise<ApiResponse<DataRecord>> {
        return this.post<DataRecord>(`/api/data/${recordId}`, data);
    }

    /**
     * Delete a data record
     * @param recordId Record ID
     * @returns Promise with success status
     */
    async deleteDataRecord(recordId: string): Promise<ApiResponse<boolean>> {
        return this.post<boolean>(`/api/data/${recordId}/delete`, {});
    }

    /**
     * Get collection by ID
     * @param collectionId Collection ID
     * @returns Promise with collection data
     */
    async getCollection(collectionId: string): Promise<ApiResponse<CollectionRecord>> {
        return this.get<CollectionRecord>(`/api/collection/${collectionId}`);
    }

    /**
     * Create a new collection
     * @param collection Collection to create
     * @returns Promise with created collection
     */
    async createCollection(collection: Partial<CollectionRecord>): Promise<ApiResponse<CollectionRecord>> {
        return this.post<CollectionRecord>('/api/collection', collection);
    }

    /**
     * Update a collection
     * @param collectionId Collection ID
     * @param data Data to update
     * @returns Promise with updated collection
     */
    async updateCollection(collectionId: string, data: Partial<CollectionRecord>): Promise<ApiResponse<CollectionRecord>> {
        return this.post<CollectionRecord>(`/api/collection/${collectionId}`, data);
    }

    /**
     * Get project by ID
     * @param projectId Project ID
     * @returns Promise with project data
     */
    async getProject(projectId: string): Promise<ApiResponse<ProjectRecord>> {
        return this.get<ProjectRecord>(`/api/project/${projectId}`);
    }

    /**
     * Create a new project
     * @param project Project to create
     * @returns Promise with created project
     */
    async createProject(project: Partial<ProjectRecord>): Promise<ApiResponse<ProjectRecord>> {
        return this.post<ProjectRecord>('/api/project', project);
    }

    /**
     * Update a project
     * @param projectId Project ID
     * @param data Data to update
     * @returns Promise with updated project
     */
    async updateProject(projectId: string, data: Partial<ProjectRecord>): Promise<ApiResponse<ProjectRecord>> {
        return this.post<ProjectRecord>(`/api/project/${projectId}`, data);
    }

    /**
     * Get ACLs for a record
     * @param recordId Record ID
     * @returns Promise with ACL data
     */
    async getAcls(recordId: string): Promise<ApiResponse<ACL[]>> {
        return this.get<ACL[]>(`/api/acl/${recordId}`);
    }

    /**
     * Set ACLs for a record
     * @param recordId Record ID
     * @param acls ACLs to set
     * @returns Promise with success status
     */
    async setAcls(recordId: string, acls: ACL[]): Promise<ApiResponse<boolean>> {
        return this.post<boolean>(`/api/acl/${recordId}`, { acls });
    }

    /**
     * Search for records
     * @param query Search query
     * @returns Promise with search results
     */
    async search(query: SearchQuery): Promise<ApiResponse<SearchResult>> {
        return this.post<SearchResult>('/api/search', query);
    }

    /**
     * Get task status
     * @param taskId Task ID
     * @returns Promise with task data
     */
    async getTaskStatus(taskId: string): Promise<ApiResponse<Task>> {
        return this.get<Task>(`/api/task/${taskId}`);
    }
}

// Create and export a singleton instance
const dataFedApi = new DataFedApi();
export default dataFedApi;