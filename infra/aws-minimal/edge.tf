locals {
  create_edge = var.enable_edge_protection
}

resource "aws_acm_certificate" "edge" {
  provider          = aws.us_east_1
  count             = local.create_edge ? 1 : 0
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "edge_validation" {
  count = local.create_edge && var.route53_zone_id != "" ? length(aws_acm_certificate.edge[0].domain_validation_options) : 0

  zone_id = var.route53_zone_id
  name    = tolist(aws_acm_certificate.edge[0].domain_validation_options)[count.index].resource_record_name
  type    = tolist(aws_acm_certificate.edge[0].domain_validation_options)[count.index].resource_record_type
  records = [tolist(aws_acm_certificate.edge[0].domain_validation_options)[count.index].resource_record_value]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "edge" {
  provider                = aws.us_east_1
  count                   = local.create_edge ? 1 : 0
  certificate_arn         = aws_acm_certificate.edge[0].arn
  validation_record_fqdns = var.route53_zone_id != "" ? aws_route53_record.edge_validation[*].fqdn : []
}

resource "aws_wafv2_web_acl" "edge" {
  provider = aws.us_east_1
  count    = local.create_edge ? 1 : 0
  name     = "${local.name_prefix}-waf"
  scope    = "CLOUDFRONT"

  default_action {
    allow {}
  }

  rule {
    name     = "ip-rate-limit"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.waf_rate_limit_per_5m
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-waf-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name_prefix}-waf"
    sampled_requests_enabled   = true
  }
}

resource "aws_cloudfront_distribution" "edge" {
  count = local.create_edge ? 1 : 0

  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${local.name_prefix} edge distribution"

  origin {
    domain_name = aws_instance.app.public_dns
    origin_id   = "${local.name_prefix}-ec2-origin"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "${local.name_prefix}-ec2-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    compress               = true

    forwarded_values {
      query_string = true
      headers      = ["*"]

      cookies {
        forward = "all"
      }
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.edge[0].certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  aliases    = var.domain_name != "" ? [var.domain_name] : []
  web_acl_id = aws_wafv2_web_acl.edge[0].arn
}

resource "aws_route53_record" "edge_alias" {
  count   = local.create_edge && var.route53_zone_id != "" ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.edge[0].domain_name
    zone_id                = aws_cloudfront_distribution.edge[0].hosted_zone_id
    evaluate_target_health = false
  }
}
