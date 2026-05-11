.PHONY: install test test-unit test-int test-db-up test-db-down clean

# Test DB connection — separate container on port 5451 with a dedicated `inventory_test` database.
export TEST_DATABASE_URL ?= postgresql://postgres:postgres@localhost:5451/inventory_test
export JWT_SECRET ?= test-secret-key-do-not-use-in-prod

install:
	pip install -r requirements-dev.txt

test: test-unit test-int

test-unit:
	pytest -m 'not integration' -v

test-int: test-db-wait
	DATABASE_URL=$(TEST_DATABASE_URL) pytest -m integration -v

test-db-up:
	docker compose -f ../docker-compose.test.yml up -d

test-db-down:
	docker compose -f ../docker-compose.test.yml down -v

test-db-wait: test-db-up
	@echo "Waiting for test DB on :5451..."
	@until docker compose -f ../docker-compose.test.yml exec -T db pg_isready -U postgres > /dev/null 2>&1; do sleep 1; done
	@echo "Test DB ready"

clean:
	find . -name __pycache__ -type d -exec rm -rf {} +
	find . -name '*.pyc' -delete
	rm -rf .pytest_cache htmlcov .coverage
