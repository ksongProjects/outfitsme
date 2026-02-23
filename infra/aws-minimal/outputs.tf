output "ec2_instance_id" {
  value       = aws_instance.app.id
  description = "EC2 instance ID."
}

output "ec2_public_ip" {
  value       = aws_eip.app.public_ip
  description = "Elastic IP for direct instance access."
}

output "ec2_public_dns" {
  value       = aws_instance.app.public_dns
  description = "EC2 public DNS name."
}

output "application_url" {
  value = var.enable_edge_protection && length(aws_cloudfront_distribution.edge) > 0 ? (
    var.domain_name != "" ? "https://${var.domain_name}" : "https://${aws_cloudfront_distribution.edge[0].domain_name}"
  ) : (
    var.domain_name != "" ? "https://${var.domain_name}" : "http://${aws_eip.app.public_ip}"
  )
  description = "Primary public URL for the application."
}

output "cloudfront_domain_name" {
  value       = var.enable_edge_protection && length(aws_cloudfront_distribution.edge) > 0 ? aws_cloudfront_distribution.edge[0].domain_name : null
  description = "CloudFront distribution domain (when edge protection is enabled)."
}

output "waf_web_acl_arn" {
  value       = var.enable_edge_protection && length(aws_wafv2_web_acl.edge) > 0 ? aws_wafv2_web_acl.edge[0].arn : null
  description = "WAF Web ACL ARN (when edge protection is enabled)."
}

output "alerts_topic_arn" {
  value       = aws_sns_topic.alerts.arn
  description = "SNS topic ARN used by infra alarms and budget notifications."
}
