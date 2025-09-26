// src/admin/dto/response/api-response.dto.ts
export class ApiResponseDto<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export class PaginatedResponseDto<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}
