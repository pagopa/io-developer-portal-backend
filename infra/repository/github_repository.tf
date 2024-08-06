resource "github_repository" "this" {
  name        = "io-developer-portal-backend"
  description = "Backend of the IO developer portal"

  #tfsec:ignore:github-repositories-private
  visibility = "public"

  allow_auto_merge            = true
  allow_rebase_merge          = true
  allow_merge_commit          = false
  allow_squash_merge          = true
  squash_merge_commit_title   = "COMMIT_OR_PR_TITLE"
  squash_merge_commit_message = "COMMIT_MESSAGES"

  delete_branch_on_merge = true

  has_projects    = false
  has_wiki        = false
  has_discussions = false
  has_issues      = false
  has_downloads   = true

  topics = ["digital-citizenship"]

  vulnerability_alerts = true

  # archive_on_destroy = true

  pages {
    build_type = "legacy"
    # custom_404 = false
    # html_url   = "https://pagopa.github.io/io-developer-portal-backend/"
    # status     = "built"
    # url        = "https://api.github.com/repos/pagopa/io-developer-portal-backend/pages"

    source {
      branch = "gh-pages"
      path   = "/"
    }
  }

  security_and_analysis {
    secret_scanning {
      status = "enabled"
    }

    secret_scanning_push_protection {
      status = "enabled"
    }

    # advanced_security {
    #   status = "enabled"
    # }
  }
}

resource "github_repository_environment" "github_repository_environment_github_pages" {
  environment = "github-pages"
  repository  = github_repository.this.name

  # deployment_branch_policy {
  #   protected_branches     = false
  #   custom_branch_policies = true
  # }

  # reviewers {
  #   teams = matchkeys(
  #     data.github_organization_teams.all.teams[*].id,
  #     data.github_organization_teams.all.teams[*].slug,
  #     local.cd.reviewers_teams
  #   )
  # }
}