ALTER TABLE "bsc_unlock_requests"
ADD COLUMN "request_source" VARCHAR(30) NOT NULL DEFAULT 'OWNER_REQUEST';

ALTER TABLE "bsc_unlock_requests"
ADD CONSTRAINT "bsc_unlock_requests_request_source_check"
CHECK ("request_source" IN ('OWNER_REQUEST', 'DIRECTOR_RESET'));
